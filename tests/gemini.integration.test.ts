import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { GoogleGenAI } from '@google/genai';

import {
  generateStructuredJson,
  setClientForTesting,
} from '../src/lib/gemini.js';

test('generateStructuredJson uses systemInstruction and safetySettings', async () => {
  const generateContentMock = mock.fn(async () => {
    return {
      text: JSON.stringify({ summary: 'mock summary' }),
      usageMetadata: { totalTokenCount: 10 },
    };
  });

  const mockClient = {
    models: {
      generateContent: generateContentMock,
    },
  } as unknown as GoogleGenAI;

  setClientForTesting(mockClient);

  await generateStructuredJson({
    prompt: 'user prompt',
    systemInstruction: 'system instruction',
    responseSchema: { type: 'object' },
  });

  assert.equal(generateContentMock.mock.calls.length, 1);
  const callArgs = generateContentMock.mock.calls[0].arguments;
  const config = callArgs[0].config;

  assert.equal(config.systemInstruction, 'system instruction');
  assert.equal(config.safetySettings.length, 4);
  assert.equal(config.safetySettings[0].threshold, 'BLOCK_NONE');
});
