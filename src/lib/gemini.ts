import { AsyncLocalStorage } from 'node:async_hooks';
import { randomInt, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { debuglog } from 'node:util';

import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';
import type { GenerateContentConfig } from '@google/genai';

import { getErrorMessage } from './errors.js';
import type { GeminiStructuredRequest } from './types.js';

// Lazy-cached: first call happens after parseCommandLineArgs() sets GEMINI_MODEL.
let _defaultModel: string | undefined;

function getDefaultModel(): string {
  if (_defaultModel !== undefined) return _defaultModel;
  const value = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  _defaultModel = value;
  return value;
}

const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const RETRY_DELAY_BASE_MS = 300;
const RETRY_DELAY_MAX_MS = 5_000;
const RETRY_JITTER_RATIO = 0.2;
const DEFAULT_SAFETY_THRESHOLD = HarmBlockThreshold.BLOCK_NONE;
const RETRYABLE_NUMERIC_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_TRANSIENT_CODES = new Set([
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
  'INTERNAL',
  'ABORTED',
]);

const numberFormatter = new Intl.NumberFormat('en-US');

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

const SAFETY_THRESHOLD_BY_NAME = {
  BLOCK_NONE: HarmBlockThreshold.BLOCK_NONE,
  BLOCK_ONLY_HIGH: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  BLOCK_MEDIUM_AND_ABOVE: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  BLOCK_LOW_AND_ABOVE: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
} as const;

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

let cachedClient: GoogleGenAI | undefined;

export const geminiEvents = new EventEmitter();

const debug = debuglog('gemini');

geminiEvents.on('log', (payload: unknown) => {
  debug(JSON.stringify(payload));
});

interface GeminiRequestContext {
  requestId: string;
  model: string;
}

const geminiContext = new AsyncLocalStorage<GeminiRequestContext>({
  name: 'gemini_request',
  defaultValue: { requestId: 'unknown', model: 'unknown' },
});

// Shared fallback avoids a fresh object allocation per logEvent call when outside a run context.
const UNKNOWN_CONTEXT: GeminiRequestContext = {
  requestId: 'unknown',
  model: 'unknown',
};

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
  const context = geminiContext.getStore() ?? UNKNOWN_CONTEXT;
  geminiEvents.emit('log', {
    event,
    requestId: context.requestId,
    model: context.model,
    ...details,
  });
}

async function safeCallOnLog(
  onLog: GeminiStructuredRequest['onLog'],
  level: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await onLog?.(level, data);
  } catch {
    // Log callbacks are best-effort; never fail the tool call.
  }
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
  if (numericCode !== undefined && RETRYABLE_NUMERIC_CODES.has(numericCode)) {
    return true;
  }

  const transientCode = getTransientErrorCode(error);
  if (
    transientCode !== undefined &&
    RETRYABLE_TRANSIENT_CODES.has(transientCode)
  ) {
    return true;
  }

  const message = getErrorMessage(error);
  return /(429|500|502|503|504|rate limit|unavailable|timeout|invalid json)/i.test(
    message
  );
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

function buildGenerationConfig(
  request: GeminiStructuredRequest,
  abortSignal: AbortSignal
): GenerateContentConfig {
  const safetyThreshold = getSafetyThreshold();

  return {
    temperature: request.temperature ?? 0.2,
    maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    responseMimeType: 'application/json',
    responseSchema: request.responseSchema,
    // Spread undefined instead of {} so no intermediate object is allocated when absent.
    ...(request.systemInstruction
      ? { systemInstruction: request.systemInstruction }
      : undefined),
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

function combineSignals(
  signal: AbortSignal,
  requestSignal?: AbortSignal
): AbortSignal {
  return requestSignal ? AbortSignal.any([signal, requestSignal]) : signal;
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

  const signal = combineSignals(controller.signal, request.signal);

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
      throw new Error(
        `Gemini request timed out after ${formatNumber(timeoutMs)}ms.`,
        { cause: error }
      );
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
  const { onLog } = request;

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

          const latencyMs = Math.round(performance.now() - startedAt);
          logEvent('gemini_call', {
            attempt,
            latencyMs,
            usageMetadata: response.usageMetadata ?? null,
          });
          await safeCallOnLog(onLog, 'info', {
            event: 'gemini_call',
            attempt,
            latencyMs,
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
          await safeCallOnLog(onLog, 'warning', {
            event: 'gemini_retry',
            attempt,
            delayMs,
            reason: getErrorMessage(error),
          });

          await sleep(delayMs, undefined, { ref: false });
        }
      }

      logEvent('gemini_failure', {
        error: getErrorMessage(lastError),
        attempts: maxRetries + 1,
      });
      await safeCallOnLog(onLog, 'error', {
        event: 'gemini_failure',
        error: getErrorMessage(lastError),
        attempts: maxRetries + 1,
      });

      throw new Error(
        `Gemini request failed after ${maxRetries + 1} attempts: ${getErrorMessage(lastError)}`,
        { cause: lastError }
      );
    }
  );
}
