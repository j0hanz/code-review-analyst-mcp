import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { z } from 'zod';

import { type GoogleGenAI, ThinkingLevel } from '@google/genai';

import {
  generateStructuredJson,
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
});
