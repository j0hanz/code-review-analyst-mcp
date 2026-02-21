import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { z } from 'zod';

import { type GoogleGenAI, ThinkingLevel } from '@google/genai';

import {
  generateStructuredJson,
  getGeminiQueueSnapshot,
  setClientForTesting,
} from '../src/lib/gemini.js';

describe('Gemini Thinking Config', () => {
  it('threads thinkingLevel without thought output by default', async () => {
    const mockGenerateContent = mock.fn(async () => {
      return {
        text: JSON.stringify({ ok: true }),
        usageMetadata: {},
      };
    });

    const mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    setClientForTesting(mockClient);

    await generateStructuredJson({
      prompt: 'test',
      responseSchema: { type: 'object' },
      thinkingLevel: 'high',
      model: 'gemini-3-pro-preview',
    });

    const call = mockGenerateContent.mock.calls[0];
    const config = call.arguments[0].config;

    assert.deepEqual(config.thinkingConfig, {
      thinkingLevel: ThinkingLevel.HIGH,
    });
  });

  it('includes thought output when includeThoughts is enabled', async () => {
    const mockGenerateContent = mock.fn(async () => {
      return {
        text: JSON.stringify({ ok: true }),
        usageMetadata: {},
      };
    });

    const mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    setClientForTesting(mockClient);

    await generateStructuredJson({
      prompt: 'test',
      responseSchema: { type: 'object' },
      thinkingLevel: 'high',
      includeThoughts: true,
      model: 'gemini-3-pro-preview',
    });

    const call = mockGenerateContent.mock.calls[0];
    const config = call.arguments[0].config;

    assert.deepEqual(config.thinkingConfig, {
      includeThoughts: true,
      thinkingLevel: ThinkingLevel.HIGH,
    });
  });

  it('applies deterministic response key ordering when provided', async () => {
    const mockGenerateContent = mock.fn(async () => {
      return {
        text: JSON.stringify({ ok: true }),
        usageMetadata: {},
      };
    });

    const mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    setClientForTesting(mockClient);

    await generateStructuredJson({
      prompt: 'test',
      responseSchema: {
        type: 'object',
        properties: {
          severity: { type: 'string' },
          summary: { type: 'string' },
        },
      },
      responseKeyOrdering: ['severity', 'summary'],
      model: 'gemini-3-flash-preview',
    });

    const call = mockGenerateContent.mock.calls[0];
    const responseSchema = call.arguments[0].config.responseSchema as {
      propertyOrdering?: string[];
    };

    assert.deepEqual(responseSchema.propertyOrdering, ['severity', 'summary']);
  });

  it('keeps function-calling context path as no-op for current prompts', async () => {
    const mockGenerateContent = mock.fn(async () => {
      return {
        text: JSON.stringify({ ok: true }),
        usageMetadata: {},
      };
    });

    const mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    setClientForTesting(mockClient);

    await generateStructuredJson({
      prompt: 'test-context',
      responseSchema: { type: 'object' },
      functionCallingContext: { modelParts: [{ role: 'model' }] },
      model: 'gemini-3-flash-preview',
    });

    const call = mockGenerateContent.mock.calls[0];
    assert.equal(call.arguments[0].contents, 'test-context');

    const queueSnapshot = getGeminiQueueSnapshot();
    assert.equal(typeof queueSnapshot.activeCalls, 'number');
    assert.equal(typeof queueSnapshot.waitingCalls, 'number');
  });

  it('emits queue telemetry via onLog before execution', async () => {
    const logEvents: string[] = [];
    const mockGenerateContent = mock.fn(async () => {
      return {
        text: JSON.stringify({ ok: true }),
        usageMetadata: {},
      };
    });

    const mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    setClientForTesting(mockClient);

    await generateStructuredJson({
      prompt: 'test-log',
      responseSchema: { type: 'object' },
      model: 'gemini-3-flash-preview',
      onLog: async (_level, data) => {
        const record = data as { event?: string };
        if (record.event) {
          logEvents.push(record.event);
        }
      },
    });

    assert.ok(logEvents.includes('gemini_queue_acquired'));
  });

  it('runs inline batch mode happy path', async () => {
    const mockBatchCreate = mock.fn(async () => ({ name: 'batches/123' }));
    const mockBatchGet = mock.fn(async () => ({
      state: 'JOB_STATE_SUCCEEDED',
      inlineResponse: { text: JSON.stringify({ ok: true, mode: 'batch' }) },
    }));

    const mockClient = {
      models: {
        generateContent: mock.fn(async () => ({
          text: JSON.stringify({ ok: false }),
          usageMetadata: {},
        })),
      },
      batches: {
        create: mockBatchCreate,
        get: mockBatchGet,
      },
    } as unknown as GoogleGenAI;

    setClientForTesting(mockClient);

    const result = await generateStructuredJson({
      prompt: 'batch-test',
      responseSchema: { type: 'object' },
      batchMode: 'inline',
      model: 'gemini-3-flash-preview',
    });

    assert.deepEqual(result, { ok: true, mode: 'batch' });
    assert.equal(mockBatchCreate.mock.calls.length, 1);
    assert.equal(mockBatchGet.mock.calls.length, 1);
  });

  it('best-effort cancels remote batch job when request is aborted', async () => {
    const controller = new AbortController();
    const mockBatchCreate = mock.fn(async () => ({ name: 'batches/abort-me' }));
    const mockBatchGet = mock.fn(async () => {
      controller.abort();
      return { state: 'JOB_STATE_RUNNING' };
    });
    const mockBatchCancel = mock.fn(async () => ({}));

    const mockClient = {
      models: {
        generateContent: mock.fn(async () => ({
          text: JSON.stringify({ ok: false }),
          usageMetadata: {},
        })),
      },
      batches: {
        create: mockBatchCreate,
        get: mockBatchGet,
        cancel: mockBatchCancel,
      },
    } as unknown as GoogleGenAI;

    setClientForTesting(mockClient);

    await assert.rejects(
      generateStructuredJson({
        prompt: 'batch-cancel-test',
        responseSchema: { type: 'object' },
        batchMode: 'inline',
        model: 'gemini-3-flash-preview',
        signal: controller.signal,
      }),
      /cancelled|aborted/i
    );

    assert.equal(mockBatchCancel.mock.calls.length, 1);
    const cancelCall = mockBatchCancel.mock.calls[0];
    assert.deepEqual(cancelCall.arguments[0], { name: 'batches/abort-me' });
  });
});
