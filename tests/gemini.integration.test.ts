import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { GoogleGenAI } from '@google/genai';

import {
  geminiEvents,
  generateStructuredJson,
  setClientForTesting,
} from '../src/lib/gemini.js';

function setMockClient(
  generateContent: (...args: unknown[]) => Promise<unknown>
): ReturnType<typeof mock.fn> {
  const generateContentMock = mock.fn(generateContent);
  const mockClient = {
    models: {
      generateContent: generateContentMock,
    },
  } as unknown as GoogleGenAI;

  setClientForTesting(mockClient);
  return generateContentMock;
}

test('generateStructuredJson uses systemInstruction and default safetySettings', async () => {
  const generateContentMock = setMockClient(async () => {
    return {
      text: JSON.stringify({ summary: 'mock summary' }),
      usageMetadata: { totalTokenCount: 10 },
    };
  });

  await generateStructuredJson({
    prompt: 'user prompt',
    systemInstruction: 'system instruction',
    responseSchema: { type: 'object' },
  });

  assert.equal(generateContentMock.mock.calls.length, 1);
  const firstCall = generateContentMock.mock.calls[0];
  assert.ok(firstCall);
  const callArgs = firstCall.arguments;
  const config = (callArgs[0] as { config: Record<string, unknown> }).config;

  assert.equal(config.systemInstruction, 'system instruction');
  const safetySettings = config.safetySettings as Array<{ threshold: string }>;
  assert.equal(safetySettings.length, 4);
  const firstSafetySetting = safetySettings[0];
  assert.ok(firstSafetySetting);
  assert.equal(firstSafetySetting.threshold, 'BLOCK_NONE');
});

test('generateStructuredJson uses env-configured safety threshold when provided', async () => {
  process.env.GEMINI_HARM_BLOCK_THRESHOLD = 'BLOCK_ONLY_HIGH';

  try {
    const generateContentMock = setMockClient(async () => {
      return {
        text: JSON.stringify({ summary: 'configured safety' }),
      };
    });

    await generateStructuredJson({
      prompt: 'user prompt',
      responseSchema: { type: 'object' },
    });

    const firstCall = generateContentMock.mock.calls[0];
    assert.ok(firstCall);
    const callArgs = firstCall.arguments;
    const config = (callArgs[0] as { config: Record<string, unknown> }).config;
    const safetySettings = config.safetySettings as Array<{
      threshold: string;
    }>;
    const firstSafetySetting = safetySettings[0];
    assert.ok(firstSafetySetting);
    assert.equal(firstSafetySetting.threshold, 'BLOCK_ONLY_HIGH');
  } finally {
    delete process.env.GEMINI_HARM_BLOCK_THRESHOLD;
  }
});

test('generateStructuredJson retries transient failures and succeeds', async () => {
  let attempt = 0;
  const generateContentMock = setMockClient(async () => {
    attempt += 1;
    if (attempt === 1) {
      throw { status: 503, message: 'service unavailable' };
    }

    return {
      text: JSON.stringify({ summary: 'recovered' }),
    };
  });

  const result = await generateStructuredJson({
    prompt: 'user prompt',
    responseSchema: { type: 'object' },
    maxRetries: 1,
  });

  assert.equal(generateContentMock.mock.calls.length, 2);
  assert.deepEqual(result, { summary: 'recovered' });
});

test('generateStructuredJson cancels during retry backoff sleep', async () => {
  const generateContentMock = setMockClient(async () => {
    throw { status: 503, message: 'service unavailable' };
  });

  const controller = new AbortController();
  const pending = generateStructuredJson({
    prompt: 'user prompt',
    responseSchema: { type: 'object' },
    maxRetries: 1,
    signal: controller.signal,
  });

  setTimeout(() => {
    controller.abort();
  }, 25);

  await assert.rejects(pending, /Gemini request was cancelled\./);
  assert.equal(generateContentMock.mock.calls.length, 1);
});

test('generateStructuredJson waits for an available slot at concurrency limit', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let releaseAll: (() => void) | undefined;

  const gate = new Promise<void>((resolve) => {
    releaseAll = resolve;
  });

  setMockClient(async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await gate;
    inFlight -= 1;

    return {
      text: JSON.stringify({ summary: 'queued-success' }),
    };
  });

  const requests = Array.from({ length: 11 }, async () => {
    return await generateStructuredJson({
      prompt: 'user prompt',
      responseSchema: { type: 'object' },
      maxRetries: 0,
    });
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
  releaseAll?.();

  const results = await Promise.all(requests);
  assert.equal(results.length, 11);
  assert.ok(maxInFlight > 0);
});

test('generateStructuredJson times out while waiting for an available slot', async () => {
  let releaseAll: (() => void) | undefined;

  const gate = new Promise<void>((resolve) => {
    releaseAll = resolve;
  });

  setMockClient(async () => {
    await gate;
    return {
      text: JSON.stringify({ summary: 'queued-success' }),
    };
  });

  const saturatedRequests = Array.from({ length: 10 }, async () => {
    return await generateStructuredJson({
      prompt: 'slot-holder',
      responseSchema: { type: 'object' },
      maxRetries: 0,
    });
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

  try {
    await assert.rejects(
      () =>
        generateStructuredJson({
          prompt: 'timeout-candidate',
          responseSchema: { type: 'object' },
          maxRetries: 0,
        }),
      /Too many concurrent Gemini calls \(limit: 10; waited \d{1,3}(?:,\d{3})*ms\)\./
    );
  } finally {
    releaseAll?.();
    await Promise.all(saturatedRequests);
  }
});

test('generateStructuredJson aborts while waiting for an available slot', async () => {
  let releaseAll: (() => void) | undefined;

  const gate = new Promise<void>((resolve) => {
    releaseAll = resolve;
  });

  setMockClient(async () => {
    await gate;
    return {
      text: JSON.stringify({ summary: 'queued-success' }),
    };
  });

  const saturatedRequests = Array.from({ length: 10 }, async () => {
    return await generateStructuredJson({
      prompt: 'slot-holder',
      responseSchema: { type: 'object' },
      maxRetries: 0,
    });
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

  const controller = new AbortController();
  const waitingRequest = generateStructuredJson({
    prompt: 'abort-candidate',
    responseSchema: { type: 'object' },
    maxRetries: 0,
    signal: controller.signal,
  });

  controller.abort();

  try {
    await assert.rejects(waitingRequest, /Gemini request was cancelled\./);
  } finally {
    releaseAll?.();
    await Promise.all(saturatedRequests);
  }
});

test('generateStructuredJson does not retry non-transient failures', async () => {
  const generateContentMock = setMockClient(async () => {
    throw new Error('input validation failed');
  });

  await assert.rejects(
    () =>
      generateStructuredJson({
        prompt: 'user prompt',
        responseSchema: { type: 'object' },
        maxRetries: 0,
      }),
    /Gemini request failed after 1 attempts: input validation failed/
  );

  assert.equal(generateContentMock.mock.calls.length, 1);
});

test('generateStructuredJson maps aborts to timeout errors', async () => {
  const generateContentMock = setMockClient(async (...callArgs: unknown[]) => {
    const [request] = callArgs as [{ config: { abortSignal: AbortSignal } }];
    assert.ok(request);

    await new Promise<never>((_resolve, reject) => {
      request.config.abortSignal.addEventListener(
        'abort',
        () => {
          reject(new Error('aborted by signal'));
        },
        { once: true }
      );
    });
  });

  await assert.rejects(
    () =>
      generateStructuredJson({
        prompt: 'user prompt',
        responseSchema: { type: 'object' },
        maxRetries: 0,
        timeoutMs: 5,
      }),
    /Gemini request failed after 1 attempts: Gemini request timed out after \d{1,3}(?:,\d{3})*ms\./
  );

  assert.equal(generateContentMock.mock.calls.length, 1);
});

test('generateStructuredJson fails on empty model body', async () => {
  setMockClient(async () => {
    return {
      text: '',
    };
  });

  await assert.rejects(
    () =>
      generateStructuredJson({
        prompt: 'user prompt',
        responseSchema: { type: 'object' },
        maxRetries: 0,
      }),
    /Gemini request failed after 1 attempts: Gemini returned an empty response body\./
  );
});

test('generateStructuredJson fails on malformed JSON output', async () => {
  setMockClient(async () => {
    return {
      text: 'not-json',
    };
  });

  await assert.rejects(
    () =>
      generateStructuredJson({
        prompt: 'user prompt',
        responseSchema: { type: 'object' },
        maxRetries: 0,
      }),
    /Gemini request failed after 1 attempts:/
  );
});

test('generateStructuredJson retries on 429 rate limit and succeeds', async () => {
  let attempt = 0;
  const generateContentMock = setMockClient(async () => {
    attempt += 1;
    if (attempt === 1) {
      throw { status: 429, message: 'rate limited' };
    }
    return {
      text: JSON.stringify({ summary: 'recovered from 429' }),
    };
  });

  const result = await generateStructuredJson({
    prompt: 'user prompt',
    responseSchema: { type: 'object' },
    maxRetries: 1,
  });

  assert.equal(generateContentMock.mock.calls.length, 2);
  assert.deepEqual(result, { summary: 'recovered from 429' });
});

test('generateStructuredJson throws after exhausting all retries', async () => {
  const generateContentMock = setMockClient(async () => {
    throw { status: 503, message: 'service unavailable' };
  });

  await assert.rejects(
    () =>
      generateStructuredJson({
        prompt: 'user prompt',
        responseSchema: { type: 'object' },
        maxRetries: 2,
      }),
    /Gemini request failed after 3 attempts: service unavailable/
  );

  assert.equal(generateContentMock.mock.calls.length, 3);
});

test('generateStructuredJson rejects with cancellation error when external signal is aborted', async () => {
  setMockClient(async (...callArgs: unknown[]) => {
    const [request] = callArgs as [{ config: { abortSignal: AbortSignal } }];
    assert.ok(request);

    if (request.config.abortSignal.aborted) {
      throw new Error('aborted by signal');
    }

    await new Promise<never>((_resolve, reject) => {
      request.config.abortSignal.addEventListener(
        'abort',
        () => {
          reject(new Error('aborted by signal'));
        },
        { once: true }
      );
    });
  });

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () =>
      generateStructuredJson({
        prompt: 'user prompt',
        responseSchema: { type: 'object' },
        maxRetries: 0,
        signal: controller.signal,
      }),
    /Gemini request was cancelled/
  );
});

test('generateStructuredJson emits gemini_failure event when all retries exhausted', async () => {
  const events: unknown[] = [];
  const listener = (payload: unknown): void => {
    events.push(payload);
  };
  geminiEvents.on('log', listener);

  setMockClient(async () => {
    throw { status: 503, message: 'service unavailable' };
  });

  try {
    await assert.rejects(
      () =>
        generateStructuredJson({
          prompt: 'user prompt',
          responseSchema: { type: 'object' },
          maxRetries: 1,
        }),
      /Gemini request failed after 2 attempts/
    );

    const failureEvents = events.filter(
      (e) => (e as Record<string, unknown>).event === 'gemini_failure'
    );
    assert.equal(failureEvents.length, 1);
    const failure = failureEvents[0] as Record<string, unknown>;
    assert.equal(failure.attempts, 2);
    assert.ok(typeof failure.error === 'string');
  } finally {
    geminiEvents.removeListener('log', listener);
  }
});

test('generateStructuredJson retries on invalid JSON and succeeds on second attempt', async () => {
  let attempt = 0;
  const generateContentMock = setMockClient(async () => {
    attempt += 1;
    if (attempt === 1) {
      return { text: 'not-valid-json{{{' };
    }
    return { text: JSON.stringify({ summary: 'repaired' }) };
  });

  const result = await generateStructuredJson({
    prompt: 'user prompt',
    responseSchema: { type: 'object' },
    maxRetries: 1,
  });

  assert.equal(generateContentMock.mock.calls.length, 2);
  assert.deepEqual(result, { summary: 'repaired' });
});
