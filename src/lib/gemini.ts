import { AsyncLocalStorage } from 'node:async_hooks';
import { randomInt, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';
import type { GenerateContentConfig } from '@google/genai';

import { getErrorMessage } from './errors.js';
import type { GeminiStructuredRequest } from './types.js';

function getDefaultModel(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
}

const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_DELAY_BASE_MS = 300;
const RETRY_DELAY_MAX_MS = 5_000;
const RETRY_JITTER_RATIO = 0.2;
const DEFAULT_SAFETY_THRESHOLD = HarmBlockThreshold.BLOCK_NONE;

const SAFETY_THRESHOLD_BY_NAME = {
  BLOCK_NONE: HarmBlockThreshold.BLOCK_NONE,
  BLOCK_ONLY_HIGH: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  BLOCK_MEDIUM_AND_ABOVE: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  BLOCK_LOW_AND_ABOVE: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
} as const;

let cachedClient: GoogleGenAI | undefined;

export const geminiEvents = new EventEmitter();

geminiEvents.on('log', (payload: unknown) => {
  console.error(JSON.stringify(payload));
});

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

export function setClientForTesting(client: GoogleGenAI): void {
  cachedClient = client;
}

function nextRequestId(): string {
  return randomUUID();
}

function logEvent(event: string, details: Record<string, unknown>): void {
  const context = geminiContext.getStore();
  geminiEvents.emit('log', {
    event,
    requestId: context?.requestId ?? null,
    model: context?.model ?? null,
    ...details,
  });
}

function getNestedError(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  const nested = record.error;
  if (!nested || typeof nested !== 'object') {
    return record;
  }

  return nested as Record<string, unknown>;
}

function getNumericErrorCode(error: unknown): number | undefined {
  const record = getNestedError(error);
  if (!record) {
    return undefined;
  }

  const candidates = [record.status, record.statusCode, record.code];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string' && /^\d+$/.test(candidate)) {
      return Number.parseInt(candidate, 10);
    }
  }

  return undefined;
}

function getTransientErrorCode(error: unknown): string | undefined {
  const record = getNestedError(error);
  if (!record) {
    return undefined;
  }

  const candidates = [record.code, record.status, record.statusText];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim().toUpperCase();
    }
  }

  return undefined;
}

function shouldRetry(error: unknown): boolean {
  const numericCode = getNumericErrorCode(error);
  if (
    numericCode === 429 ||
    numericCode === 500 ||
    numericCode === 502 ||
    numericCode === 503 ||
    numericCode === 504
  ) {
    return true;
  }

  const transientCode = getTransientErrorCode(error);
  if (
    transientCode === 'RESOURCE_EXHAUSTED' ||
    transientCode === 'UNAVAILABLE' ||
    transientCode === 'DEADLINE_EXCEEDED' ||
    transientCode === 'INTERNAL' ||
    transientCode === 'ABORTED'
  ) {
    return true;
  }

  const message = getErrorMessage(error);
  return /(429|500|502|503|504|rate limit|unavailable|timeout)/i.test(message);
}

function getRetryDelayMs(attempt: number): number {
  const exponentialDelay = RETRY_DELAY_BASE_MS * 2 ** attempt;
  const boundedDelay = Math.min(RETRY_DELAY_MAX_MS, exponentialDelay);
  const jitterWindow = Math.max(
    1,
    Math.floor(boundedDelay * RETRY_JITTER_RATIO)
  );
  const jitter = randomInt(0, jitterWindow);
  return Math.min(RETRY_DELAY_MAX_MS, boundedDelay + jitter);
}

function getSafetyThreshold(): HarmBlockThreshold {
  const threshold = process.env.GEMINI_HARM_BLOCK_THRESHOLD;
  if (!threshold) {
    return DEFAULT_SAFETY_THRESHOLD;
  }

  const normalizedThreshold = threshold.trim().toUpperCase();
  if (normalizedThreshold in SAFETY_THRESHOLD_BY_NAME) {
    return SAFETY_THRESHOLD_BY_NAME[
      normalizedThreshold as keyof typeof SAFETY_THRESHOLD_BY_NAME
    ];
  }

  return DEFAULT_SAFETY_THRESHOLD;
}

function buildGenerationConfig(
  request: GeminiStructuredRequest,
  abortSignal: AbortSignal
): GenerateContentConfig {
  const safetyThreshold = getSafetyThreshold();

  return {
    temperature: request.temperature ?? 0.2,
    responseMimeType: 'application/json',
    responseSchema: request.responseSchema,
    ...(request.systemInstruction
      ? { systemInstruction: request.systemInstruction }
      : {}),
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: safetyThreshold,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: safetyThreshold,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: safetyThreshold,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: safetyThreshold,
      },
    ],
    abortSignal,
  };
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

  const signal = request.signal
    ? AbortSignal.any([controller.signal, request.signal])
    : controller.signal;

  try {
    return await getClient().models.generateContent({
      model,
      contents: request.prompt,
      config: buildGenerationConfig(request, signal),
    });
  } catch (error: unknown) {
    if (request.signal?.aborted) {
      throw new Error('Gemini request was cancelled.');
    }

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
  const model = request.model ?? getDefaultModel();
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = request.maxRetries ?? DEFAULT_MAX_RETRIES;

  return geminiContext.run(
    { requestId: nextRequestId(), model },
    async (): Promise<unknown> => {
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
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

          let parsed: unknown;
          try {
            parsed = JSON.parse(response.text);
          } catch (error: unknown) {
            throw new Error(
              `Model produced invalid JSON: ${getErrorMessage(error)}`
            );
          }

          return parsed;
        } catch (error: unknown) {
          lastError = error;
          const retryable = shouldRetry(error);
          if (attempt >= maxRetries || !retryable) {
            break;
          }

          const delayMs = getRetryDelayMs(attempt);
          logEvent('gemini_retry', {
            attempt,
            delayMs,
            reason: getErrorMessage(error),
          });

          await sleep(delayMs, undefined, { ref: false });
        }
      }

      throw new Error(
        `Gemini request failed after ${maxRetries + 1} attempts: ${getErrorMessage(lastError)}`
      );
    }
  );
}
