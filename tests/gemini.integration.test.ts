import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { GoogleGenAI } from '@google/genai';

import {
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
  const callArgs = generateContentMock.mock.calls[0].arguments;
  const config = (callArgs[0] as { config: Record<string, unknown> }).config;

  assert.equal(config.systemInstruction, 'system instruction');
  assert.equal(
    (config.safetySettings as Array<{ threshold: string }>).length,
    4
  );
  assert.equal(
    (config.safetySettings as Array<{ threshold: string }>)[0].threshold,
    'BLOCK_NONE'
  );
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

    const callArgs = generateContentMock.mock.calls[0].arguments;
    const config = (callArgs[0] as { config: Record<string, unknown> }).config;
    assert.equal(
      (config.safetySettings as Array<{ threshold: string }>)[0].threshold,
      'BLOCK_ONLY_HIGH'
    );
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
  const generateContentMock = setMockClient(
    async (args: { config: { abortSignal: AbortSignal } }) => {
      await new Promise<never>((_resolve, reject) => {
        args.config.abortSignal.addEventListener(
          'abort',
          () => {
            reject(new Error('aborted by signal'));
          },
          { once: true }
        );
      });
    }
  );

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
