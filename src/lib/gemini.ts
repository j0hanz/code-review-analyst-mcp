import { GoogleGenAI } from '@google/genai';

import { getErrorMessage } from './errors.js';
import type { GeminiStructuredRequest } from './types.js';

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 45_000;

let cachedClient: GoogleGenAI | undefined;

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY.');
  }

  return apiKey;
}

function getClient(): GoogleGenAI {
  cachedClient ??= new GoogleGenAI({ apiKey: getApiKey() });

  return cachedClient;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetry(error: unknown): boolean {
  const message = getErrorMessage(error);
  return /(429|500|502|503|504|rate limit|unavailable|timeout)/i.test(message);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(`Gemini request timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    }),
  ]);
}

export async function generateStructuredJson(
  request: GeminiStructuredRequest
): Promise<unknown> {
  const model = request.model ?? DEFAULT_MODEL;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = request.maxRetries ?? DEFAULT_MAX_RETRIES;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    const startedAt = Date.now();

    try {
      const response = await withTimeout(
        getClient().models.generateContent({
          model,
          contents: request.prompt,
          config: {
            temperature: request.temperature ?? 0.2,
            responseMimeType: 'application/json',
            responseSchema: request.responseSchema,
          },
        }),
        timeoutMs
      );

      console.error(
        JSON.stringify({
          event: 'gemini_call',
          model,
          latencyMs: Date.now() - startedAt,
          usageMetadata: response.usageMetadata ?? null,
        })
      );

      if (!response.text) {
        throw new Error('Gemini returned an empty response body.');
      }

      return JSON.parse(response.text);
    } catch (error: unknown) {
      lastError = error;
      if (attempt >= maxRetries || !shouldRetry(error)) {
        break;
      }

      await delay(300 * 2 ** attempt);
      attempt += 1;
    }
  }

  throw new Error(
    `Gemini request failed after ${maxRetries + 1} attempts: ${getErrorMessage(lastError)}`
  );
}
