import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

import { GoogleGenAI } from '@google/genai';

import { getErrorMessage } from './errors.js';
import type { GeminiStructuredRequest } from './types.js';

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 45_000;
const RETRY_DELAY_BASE_MS = 300;

let cachedClient: GoogleGenAI | undefined;
let requestSequence = 0;

interface GeminiRequestContext {
  requestId: string;
  model: string;
}

const geminiContext = new AsyncLocalStorage<GeminiRequestContext>({
  name: 'gemini_request',
});

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

function nextRequestId(): string {
  requestSequence += 1;
  return `gemini-${requestSequence}`;
}

function logEvent(event: string, details: Record<string, unknown>): void {
  const context = geminiContext.getStore();
  console.error(
    JSON.stringify({
      event,
      requestId: context?.requestId ?? null,
      model: context?.model ?? null,
      ...details,
    })
  );
}

function shouldRetry(error: unknown): boolean {
  const message = getErrorMessage(error);
  return /(429|500|502|503|504|rate limit|unavailable|timeout)/i.test(message);
}

async function generateContentWithTimeout(
  request: GeminiStructuredRequest,
  model: string,
  timeoutMs: number
): Promise<Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  timeout.unref();

  try {
    return await getClient().models.generateContent({
      model,
      contents: request.prompt,
      config: {
        temperature: request.temperature ?? 0.2,
        responseMimeType: 'application/json',
        responseSchema: request.responseSchema,
        abortSignal: controller.signal,
      },
    });
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new Error(`Gemini request timed out after ${timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateStructuredJson(
  request: GeminiStructuredRequest
): Promise<unknown> {
  const model = request.model ?? DEFAULT_MODEL;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = request.maxRetries ?? DEFAULT_MAX_RETRIES;

  return geminiContext.run(
    { requestId: nextRequestId(), model },
    async (): Promise<unknown> => {
      let attempt = 0;
      let lastError: unknown;

      while (attempt <= maxRetries) {
        const startedAt = performance.now();

        try {
          const response = await generateContentWithTimeout(
            request,
            model,
            timeoutMs
          );

          logEvent('gemini_call', {
            attempt,
            latencyMs: Math.round(performance.now() - startedAt),
            usageMetadata: response.usageMetadata ?? null,
          });

          if (!response.text) {
            throw new Error('Gemini returned an empty response body.');
          }

          return JSON.parse(response.text);
        } catch (error: unknown) {
          lastError = error;
          const retryable = shouldRetry(error);
          if (attempt >= maxRetries || !retryable) {
            break;
          }

          const delayMs = RETRY_DELAY_BASE_MS * 2 ** attempt;
          logEvent('gemini_retry', {
            attempt,
            delayMs,
            reason: getErrorMessage(error),
          });

          await sleep(delayMs, undefined, { ref: false });
          attempt += 1;
        }
      }

      throw new Error(
        `Gemini request failed after ${maxRetries + 1} attempts: ${getErrorMessage(lastError)}`
      );
    }
  );
}
