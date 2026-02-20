import { AsyncLocalStorage } from 'node:async_hooks';
import { randomInt, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { debuglog } from 'node:util';

import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';
import type { GenerateContentConfig } from '@google/genai';

import { createCachedEnvInt } from './env-config.js';
import { getErrorMessage, RETRYABLE_UPSTREAM_ERROR_PATTERN } from './errors.js';
import type { GeminiStructuredRequest } from './types.js';

// Lazy-cached: first call happens after parseCommandLineArgs() sets GEMINI_MODEL.
let _defaultModel: string | undefined;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_MODEL_ENV_VAR = 'GEMINI_MODEL';
const GEMINI_HARM_BLOCK_THRESHOLD_ENV_VAR = 'GEMINI_HARM_BLOCK_THRESHOLD';
const GEMINI_API_KEY_ENV_VAR = 'GEMINI_API_KEY';
const GOOGLE_API_KEY_ENV_VAR = 'GOOGLE_API_KEY';
type GeminiOnLog = GeminiStructuredRequest['onLog'];

function getDefaultModel(): string {
  if (_defaultModel !== undefined) return _defaultModel;
  const value = process.env[GEMINI_MODEL_ENV_VAR] ?? DEFAULT_MODEL;
  _defaultModel = value;
  return value;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const RETRY_DELAY_BASE_MS = 300;
const RETRY_DELAY_MAX_MS = 5_000;
const RETRY_JITTER_RATIO = 0.2;
const DEFAULT_SAFETY_THRESHOLD = HarmBlockThreshold.BLOCK_NONE;
const UNKNOWN_REQUEST_CONTEXT_VALUE = 'unknown';
const RETRYABLE_NUMERIC_CODES = new Set([429, 500, 502, 503, 504]);
const DIGITS_ONLY_PATTERN = /^\d+$/;
const SLEEP_UNREF_OPTIONS = { ref: false } as const;

const maxConcurrentCallsConfig = createCachedEnvInt('MAX_CONCURRENT_CALLS', 10);
const concurrencyWaitMsConfig = createCachedEnvInt(
  'MAX_CONCURRENT_CALLS_WAIT_MS',
  2_000
);
const concurrencyPollMsConfig = createCachedEnvInt(
  'MAX_CONCURRENT_CALLS_POLL_MS',
  25
);
let activeCalls = 0;

const RETRYABLE_TRANSIENT_CODES = new Set([
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
  'INTERNAL',
  'ABORTED',
]);

const SAFETY_CATEGORIES = [
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
] as const;

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

let cachedSafetyThresholdEnv: string | undefined;
let cachedSafetyThreshold = DEFAULT_SAFETY_THRESHOLD;
const safetySettingsCache = new Map<
  HarmBlockThreshold,
  { category: HarmCategory; threshold: HarmBlockThreshold }[]
>();

function getSafetyThreshold(): HarmBlockThreshold {
  const threshold = process.env[GEMINI_HARM_BLOCK_THRESHOLD_ENV_VAR];
  if (threshold === cachedSafetyThresholdEnv) {
    return cachedSafetyThreshold;
  }

  cachedSafetyThresholdEnv = threshold;
  if (!threshold) {
    cachedSafetyThreshold = DEFAULT_SAFETY_THRESHOLD;
    return cachedSafetyThreshold;
  }

  const parsedThreshold = parseSafetyThreshold(threshold);
  if (parsedThreshold) {
    cachedSafetyThreshold = parsedThreshold;
    return cachedSafetyThreshold;
  }

  cachedSafetyThreshold = DEFAULT_SAFETY_THRESHOLD;
  return cachedSafetyThreshold;
}

function parseSafetyThreshold(
  threshold: string
): HarmBlockThreshold | undefined {
  const normalizedThreshold = threshold.trim().toUpperCase();
  if (!(normalizedThreshold in SAFETY_THRESHOLD_BY_NAME)) {
    return undefined;
  }

  return SAFETY_THRESHOLD_BY_NAME[
    normalizedThreshold as keyof typeof SAFETY_THRESHOLD_BY_NAME
  ];
}

function getThinkingConfig(
  thinkingBudget: number | undefined
): { includeThoughts: true; thinkingBudget: number } | undefined {
  return thinkingBudget !== undefined
    ? { includeThoughts: true, thinkingBudget }
    : undefined;
}

function getSafetySettings(
  threshold: HarmBlockThreshold
): { category: HarmCategory; threshold: HarmBlockThreshold }[] {
  const cached = safetySettingsCache.get(threshold);
  if (cached) {
    return cached;
  }

  const settings = new Array<{
    category: HarmCategory;
    threshold: HarmBlockThreshold;
  }>();
  for (const category of SAFETY_CATEGORIES) {
    settings.push({ category, threshold });
  }
  safetySettingsCache.set(threshold, settings);
  return settings;
}

let cachedClient: GoogleGenAI | undefined;

export const geminiEvents = new EventEmitter();

const debug = debuglog('gemini') as ReturnType<typeof debuglog> & {
  enabled?: boolean;
};

geminiEvents.on('log', (payload: unknown) => {
  if (debug.enabled) {
    debug('%j', payload);
  }
});

interface GeminiRequestContext {
  requestId: string;
  model: string;
}

type GeminiLogLevel = 'info' | 'warning' | 'error';

interface GeminiLogPayload {
  event: string;
  details: Record<string, unknown>;
}

const geminiContext = new AsyncLocalStorage<GeminiRequestContext>({
  name: 'gemini_request',
  defaultValue: {
    requestId: UNKNOWN_REQUEST_CONTEXT_VALUE,
    model: UNKNOWN_REQUEST_CONTEXT_VALUE,
  },
});

// Shared fallback avoids a fresh object allocation per logEvent call when outside a run context.
const UNKNOWN_CONTEXT: GeminiRequestContext = {
  requestId: UNKNOWN_REQUEST_CONTEXT_VALUE,
  model: UNKNOWN_REQUEST_CONTEXT_VALUE,
};

export function getCurrentRequestId(): string {
  const context = geminiContext.getStore();
  return context?.requestId ?? UNKNOWN_REQUEST_CONTEXT_VALUE;
}

function getApiKey(): string {
  const apiKey =
    process.env[GEMINI_API_KEY_ENV_VAR] ?? process.env[GOOGLE_API_KEY_ENV_VAR];
  if (!apiKey) {
    throw new Error(
      `Missing ${GEMINI_API_KEY_ENV_VAR} or ${GOOGLE_API_KEY_ENV_VAR}.`
    );
  }

  return apiKey;
}

function getClient(): GoogleGenAI {
  cachedClient ??= new GoogleGenAI({
    apiKey: getApiKey(),
    apiVersion: 'v1beta',
  });

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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

async function safeCallOnLog(
  onLog: GeminiOnLog,
  level: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await onLog?.(level, data);
  } catch {
    // Log callbacks are best-effort; never fail the tool call.
  }
}

async function emitGeminiLog(
  onLog: GeminiOnLog,
  level: GeminiLogLevel,
  payload: GeminiLogPayload
): Promise<void> {
  logEvent(payload.event, payload.details);
  await safeCallOnLog(onLog, level, {
    event: payload.event,
    ...payload.details,
  });
}

function getNestedError(error: unknown): Record<string, unknown> | undefined {
  const record = asRecord(error);
  if (!record) {
    return undefined;
  }

  const nested = record.error;
  const nestedRecord = asRecord(nested);
  if (!nestedRecord) {
    return record;
  }

  return nestedRecord;
}

function toNumericCode(candidate: unknown): number | undefined {
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate;
  }

  if (typeof candidate === 'string' && DIGITS_ONLY_PATTERN.test(candidate)) {
    return Number.parseInt(candidate, 10);
  }

  return undefined;
}

function toUpperStringCode(candidate: unknown): string | undefined {
  if (typeof candidate !== 'string') {
    return undefined;
  }

  const normalized = candidate.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

function findFirstNumericCode(
  record: Record<string, unknown>,
  keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const numericCode = toNumericCode(record[key]);
    if (numericCode !== undefined) {
      return numericCode;
    }
  }
  return undefined;
}

function findFirstStringCode(
  record: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const stringCode = toUpperStringCode(record[key]);
    if (stringCode !== undefined) {
      return stringCode;
    }
  }
  return undefined;
}

function getNumericErrorCode(error: unknown): number | undefined {
  const record = getNestedError(error);
  if (!record) {
    return undefined;
  }

  return findFirstNumericCode(record, ['status', 'statusCode', 'code']);
}

function getTransientErrorCode(error: unknown): string | undefined {
  const record = getNestedError(error);
  if (!record) {
    return undefined;
  }

  return findFirstStringCode(record, ['code', 'status', 'statusText']);
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
  return RETRYABLE_UPSTREAM_ERROR_PATTERN.test(message);
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
  const thinkingConfig = getThinkingConfig(request.thinkingBudget);
  const config: GenerateContentConfig = {
    temperature: request.temperature ?? 0.2,
    maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    responseMimeType: 'application/json',
    responseSchema: request.responseSchema,
    safetySettings: getSafetySettings(getSafetyThreshold()),
    topP: 0.95,
    topK: 40,
    abortSignal,
  };

  if (request.systemInstruction) {
    config.systemInstruction = request.systemInstruction;
  }

  if (thinkingConfig) {
    config.thinkingConfig = thinkingConfig;
  }

  return config;
}

function combineSignals(
  signal: AbortSignal,
  requestSignal?: AbortSignal
): AbortSignal {
  return requestSignal ? AbortSignal.any([signal, requestSignal]) : signal;
}

function parseStructuredResponse(responseText: string | undefined): unknown {
  if (!responseText) {
    throw new Error('Gemini returned an empty response body.');
  }

  try {
    return JSON.parse(responseText);
  } catch (error: unknown) {
    throw new Error(`Model produced invalid JSON: ${getErrorMessage(error)}`);
  }
}

function formatTimeoutErrorMessage(timeoutMs: number): string {
  return `Gemini request timed out after ${formatNumber(timeoutMs)}ms.`;
}

function formatConcurrencyLimitErrorMessage(
  limit: number,
  waitLimitMs: number
): string {
  return `Too many concurrent Gemini calls (limit: ${formatNumber(limit)}; waited ${formatNumber(waitLimitMs)}ms).`;
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
      throw new Error(formatTimeoutErrorMessage(timeoutMs), { cause: error });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function executeAttempt(
  request: GeminiStructuredRequest,
  model: string,
  timeoutMs: number,
  attempt: number,
  onLog: GeminiOnLog
): Promise<unknown> {
  const startedAt = performance.now();
  const response = await generateContentWithTimeout(request, model, timeoutMs);
  const latencyMs = Math.round(performance.now() - startedAt);

  await emitGeminiLog(onLog, 'info', {
    event: 'gemini_call',
    details: {
      attempt,
      latencyMs,
      usageMetadata: response.usageMetadata ?? null,
    },
  });

  return parseStructuredResponse(response.text);
}

async function waitBeforeRetry(
  attempt: number,
  error: unknown,
  onLog: GeminiOnLog
): Promise<void> {
  const delayMs = getRetryDelayMs(attempt);
  const reason = getErrorMessage(error);

  await emitGeminiLog(onLog, 'warning', {
    event: 'gemini_retry',
    details: {
      attempt,
      delayMs,
      reason,
    },
  });

  await sleep(delayMs, undefined, SLEEP_UNREF_OPTIONS);
}

async function throwGeminiFailure(
  maxRetries: number,
  lastError: unknown,
  onLog: GeminiOnLog
): Promise<never> {
  const attempts = maxRetries + 1;
  const message = getErrorMessage(lastError);

  await emitGeminiLog(onLog, 'error', {
    event: 'gemini_failure',
    details: {
      error: message,
      attempts,
    },
  });

  throw new Error(
    `Gemini request failed after ${attempts} attempts: ${message}`,
    { cause: lastError }
  );
}

async function runWithRetries(
  request: GeminiStructuredRequest,
  model: string,
  timeoutMs: number,
  maxRetries: number,
  onLog: GeminiOnLog
): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await executeAttempt(request, model, timeoutMs, attempt, onLog);
    } catch (error: unknown) {
      lastError = error;
      if (!canRetryAttempt(attempt, maxRetries, error)) {
        break;
      }

      await waitBeforeRetry(attempt, error, onLog);
    }
  }

  return throwGeminiFailure(maxRetries, lastError, onLog);
}

function canRetryAttempt(
  attempt: number,
  maxRetries: number,
  error: unknown
): boolean {
  return attempt < maxRetries && shouldRetry(error);
}

async function waitForConcurrencySlot(
  limit: number,
  requestSignal?: AbortSignal
): Promise<void> {
  const waitLimitMs = concurrencyWaitMsConfig.get();
  const pollMs = concurrencyPollMsConfig.get();
  const deadline = performance.now() + waitLimitMs;

  while (activeCalls >= limit) {
    if (requestSignal?.aborted) {
      throw new Error('Gemini request was cancelled.');
    }

    if (performance.now() >= deadline) {
      throw new Error(formatConcurrencyLimitErrorMessage(limit, waitLimitMs));
    }

    await sleep(pollMs, undefined, SLEEP_UNREF_OPTIONS);
  }
}

export async function generateStructuredJson(
  request: GeminiStructuredRequest
): Promise<unknown> {
  const model = request.model ?? getDefaultModel();
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = request.maxRetries ?? DEFAULT_MAX_RETRIES;
  const { onLog } = request;

  const limit = maxConcurrentCallsConfig.get();
  await waitForConcurrencySlot(limit, request.signal);

  activeCalls += 1;
  try {
    return await geminiContext.run({ requestId: nextRequestId(), model }, () =>
      runWithRetries(request, model, timeoutMs, maxRetries, onLog)
    );
  } finally {
    activeCalls -= 1;
  }
}
