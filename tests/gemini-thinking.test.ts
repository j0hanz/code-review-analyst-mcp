import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { z } from 'zod';

import type { GoogleGenAI } from '@google/genai';

import {
  generateStructuredJson,
  setClientForTesting,
} from '../src/lib/gemini.js';

describe('Gemini Thinking Config', () => {
  it('threads thinkingBudget without thought output by default', async () => {
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
      thinkingBudget: 1024,
      model: 'gemini-2.5-pro',
    });

    const call = mockGenerateContent.mock.calls[0];
    const config = call.arguments[0].config;

    assert.deepEqual(config.thinkingConfig, {
      thinkingBudget: 1024,
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
      thinkingBudget: 1024,
      includeThoughts: true,
      model: 'gemini-2.5-pro',
    });

    const call = mockGenerateContent.mock.calls[0];
    const config = call.arguments[0].config;

    assert.deepEqual(config.thinkingConfig, {
      includeThoughts: true,
      thinkingBudget: 1024,
    });
  });
});
