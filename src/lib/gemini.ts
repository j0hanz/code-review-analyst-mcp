import { AsyncLocalStorage } from 'node:async_hooks';
import { randomInt, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { debuglog } from 'node:util';

import {
  FinishReason,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  ThinkingLevel,
} from '@google/genai';
import type { GenerateContentConfig } from '@google/genai';

import { createCachedEnvInt } from './env-config.js';
import { getErrorMessage, RETRYABLE_UPSTREAM_ERROR_PATTERN } from './errors.js';
import type { GeminiStructuredRequest } from './types.js';

// Lazy-cached: first call happens after parseCommandLineArgs() sets GEMINI_MODEL.
let _defaultModel: string | undefined;
const DEFAULT_MODEL = 'gemini-3-flash-preview';
const GEMINI_MODEL_ENV_VAR = 'GEMINI_MODEL';
const GEMINI_HARM_BLOCK_THRESHOLD_ENV_VAR = 'GEMINI_HARM_BLOCK_THRESHOLD';
const GEMINI_INCLUDE_THOUGHTS_ENV_VAR = 'GEMINI_INCLUDE_THOUGHTS';
const GEMINI_BATCH_MODE_ENV_VAR = 'GEMINI_BATCH_MODE';
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
const DEFAULT_INCLUDE_THOUGHTS = false;
const DEFAULT_BATCH_MODE = 'off';
const UNKNOWN_REQUEST_CONTEXT_VALUE = 'unknown';
const RETRYABLE_NUMERIC_CODES = new Set([429, 500, 502, 503, 504]);
const DIGITS_ONLY_PATTERN = /^\d+$/;
const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);
const SLEEP_UNREF_OPTIONS = { ref: false } as const;

const maxConcurrentCallsConfig = createCachedEnvInt('MAX_CONCURRENT_CALLS', 10);
const maxConcurrentBatchCallsConfig = createCachedEnvInt(
  'MAX_CONCURRENT_BATCH_CALLS',
  2
);
const concurrencyWaitMsConfig = createCachedEnvInt(
  'MAX_CONCURRENT_CALLS_WAIT_MS',
  2_000
);
const batchPollIntervalMsConfig = createCachedEnvInt(
  'GEMINI_BATCH_POLL_INTERVAL_MS',
  2_000
);
const batchTimeoutMsConfig = createCachedEnvInt(
  'GEMINI_BATCH_TIMEOUT_MS',
  120_000
);
let activeCalls = 0;
let activeBatchCalls = 0;
const slotWaiters: (() => void)[] = [];
const batchSlotWaiters: (() => void)[] = [];

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
let cachedIncludeThoughtsEnv: string | undefined;
let cachedIncludeThoughts = DEFAULT_INCLUDE_THOUGHTS;
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
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high' | undefined,
  includeThoughts: boolean
): { thinkingLevel?: ThinkingLevel; includeThoughts?: true } | undefined {
  if (thinkingLevel === undefined && !includeThoughts) {
    return undefined;
  }

  const config: { thinkingLevel?: ThinkingLevel; includeThoughts?: true } = {};
  if (thinkingLevel !== undefined) {
    switch (thinkingLevel) {
      case 'minimal':
        config.thinkingLevel = ThinkingLevel.MINIMAL;
        break;
      case 'low':
        config.thinkingLevel = ThinkingLevel.LOW;
        break;
      case 'medium':
        config.thinkingLevel = ThinkingLevel.MEDIUM;
        break;
      case 'high':
        config.thinkingLevel = ThinkingLevel.HIGH;
        break;
    }
  }
  if (includeThoughts) {
    config.includeThoughts = true;
  }
  return config;
}

function parseBooleanEnv(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return undefined;
  }

  if (TRUE_ENV_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_ENV_VALUES.has(normalized)) {
    return false;
  }

  return undefined;
}

function getDefaultIncludeThoughts(): boolean {
  const value = process.env[GEMINI_INCLUDE_THOUGHTS_ENV_VAR];
  if (value === cachedIncludeThoughtsEnv) {
    return cachedIncludeThoughts;
  }

  cachedIncludeThoughtsEnv = value;
  if (!value) {
    cachedIncludeThoughts = DEFAULT_INCLUDE_THOUGHTS;
    return cachedIncludeThoughts;
  }

  cachedIncludeThoughts = parseBooleanEnv(value) ?? DEFAULT_INCLUDE_THOUGHTS;
  return cachedIncludeThoughts;
}

function getDefaultBatchMode(): 'off' | 'inline' {
  const value = process.env[GEMINI_BATCH_MODE_ENV_VAR]?.trim().toLowerCase();
  if (value === 'inline') {
    return 'inline';
  }

  return DEFAULT_BATCH_MODE;
}

function applyResponseKeyOrdering(
  responseSchema: Readonly<Record<string, unknown>>,
  responseKeyOrdering: readonly string[] | undefined
): Readonly<Record<string, unknown>> {
  if (!responseKeyOrdering || responseKeyOrdering.length === 0) {
    return responseSchema;
  }

  return {
    ...responseSchema,
    propertyOrdering: [...responseKeyOrdering],
  };
}

function getPromptWithFunctionCallingContext(
  request: GeminiStructuredRequest
): string {
  return request.prompt;
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

function toRecord(value: unknown): Record<string, unknown> | undefined {
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
  const record = toRecord(error);
  if (!record) {
    return undefined;
  }

  const nested = record.error;
  const nestedRecord = toRecord(nested);
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

const NUMERIC_ERROR_KEYS = ['status', 'statusCode', 'code'] as const;

function getNumericErrorCode(error: unknown): number | undefined {
  const record = getNestedError(error);
  if (!record) {
    return undefined;
  }

  return findFirstNumericCode(record, NUMERIC_ERROR_KEYS);
}

const TRANSIENT_ERROR_KEYS = ['code', 'status', 'statusText'] as const;

function getTransientErrorCode(error: unknown): string | undefined {
  const record = getNestedError(error);
  if (!record) {
    return undefined;
  }

  return findFirstStringCode(record, TRANSIENT_ERROR_KEYS);
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
  const includeThoughts =
    request.includeThoughts ?? getDefaultIncludeThoughts();
  const thinkingConfig = getThinkingConfig(
    request.thinkingLevel,
    includeThoughts
  );
  const config: GenerateContentConfig = {
    temperature: request.temperature ?? 1.0,
    maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    responseMimeType: 'application/json',
    responseSchema: applyResponseKeyOrdering(
      request.responseSchema,
      request.responseKeyOrdering
    ),
    safetySettings: getSafetySettings(getSafetyThreshold()),
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

  const jsonMatch = /```(?:json)?\n?([\s\S]*?)(?=\n?```)/u.exec(responseText);
  const jsonText = jsonMatch?.[1] ?? responseText;

  try {
    return JSON.parse(jsonText);
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
      contents: getPromptWithFunctionCallingContext(request),
      config: buildGenerationConfig(request, signal),
    });
  } catch (error: unknown) {
    if (request.signal?.aborted === true) {
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
  const finishReason = response.candidates?.[0]?.finishReason;

  let thoughts: string | undefined;
  const parts = response.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const thoughtParts = parts.filter(
      (p) => p.thought === true && typeof p.text === 'string'
    );
    if (thoughtParts.length > 0) {
      thoughts = thoughtParts.map((p) => p.text).join('\n\n');
    }
  }

  await emitGeminiLog(onLog, 'info', {
    event: 'gemini_call',
    details: {
      attempt,
      latencyMs,
      finishReason: finishReason ?? null,
      usageMetadata: response.usageMetadata ?? null,
      ...(thoughts ? { thoughts } : {}),
    },
  });

  if (finishReason === FinishReason.MAX_TOKENS) {
    const limit = request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    throw new Error(
      `Response truncated: model output exceeds limit (maxOutputTokens=${formatNumber(limit)}). Increase maxOutputTokens or reduce prompt complexity.`
    );
  }

  return parseStructuredResponse(response.text);
}

async function waitBeforeRetry(
  attempt: number,
  error: unknown,
  onLog: GeminiOnLog,
  requestSignal?: AbortSignal
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

  if (requestSignal?.aborted) {
    throw new Error('Gemini request was cancelled.');
  }

  try {
    await sleep(
      delayMs,
      undefined,
      requestSignal
        ? { ...SLEEP_UNREF_OPTIONS, signal: requestSignal }
        : SLEEP_UNREF_OPTIONS
    );
  } catch (sleepError: unknown) {
    if (requestSignal?.aborted) {
      throw new Error('Gemini request was cancelled.');
    }

    throw sleepError;
  }
}

async function throwGeminiFailure(
  attemptsMade: number,
  lastError: unknown,
  onLog: GeminiOnLog
): Promise<never> {
  const message = getErrorMessage(lastError);

  await emitGeminiLog(onLog, 'error', {
    event: 'gemini_failure',
    details: {
      error: message,
      attempts: attemptsMade,
    },
  });

  throw new Error(
    `Gemini request failed after ${attemptsMade} attempts: ${message}`,
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
  let attempt = 0;

  for (; attempt <= maxRetries; attempt += 1) {
    try {
      return await executeAttempt(request, model, timeoutMs, attempt, onLog);
    } catch (error: unknown) {
      lastError = error;
      if (!canRetryAttempt(attempt, maxRetries, error)) {
        attempt += 1; // Count this attempt before breaking
        break;
      }

      await waitBeforeRetry(attempt, error, onLog, request.signal);
    }
  }

  return throwGeminiFailure(attempt, lastError, onLog);
}

function canRetryAttempt(
  attempt: number,
  maxRetries: number,
  error: unknown
): boolean {
  return attempt < maxRetries && shouldRetry(error);
}

function tryWakeNextWaiter(): void {
  const next = slotWaiters.shift();
  if (next !== undefined) {
    next();
  }
}

async function waitForSlot(
  limit: number,
  getActiveCount: () => number,
  acquireSlot: () => void,
  waiters: (() => void)[],
  requestSignal?: AbortSignal
): Promise<void> {
  if (waiters.length === 0 && getActiveCount() < limit) {
    acquireSlot();
    return;
  }

  if (requestSignal?.aborted) {
    throw new Error('Gemini request was cancelled.');
  }

  const waitLimitMs = concurrencyWaitMsConfig.get();

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const waiter = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      if (requestSignal) {
        requestSignal.removeEventListener('abort', onAbort);
      }
      acquireSlot();
      resolve();
    };

    waiters.push(waiter);

    const deadlineTimer = setTimeout((): void => {
      if (settled) return;
      settled = true;
      const idx = waiters.indexOf(waiter);
      if (idx !== -1) {
        waiters.splice(idx, 1);
      }
      if (requestSignal) {
        requestSignal.removeEventListener('abort', onAbort);
      }
      reject(new Error(formatConcurrencyLimitErrorMessage(limit, waitLimitMs)));
    }, waitLimitMs);
    deadlineTimer.unref();

    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      const idx = waiters.indexOf(waiter);
      if (idx !== -1) {
        waiters.splice(idx, 1);
      }
      clearTimeout(deadlineTimer);
      reject(new Error('Gemini request was cancelled.'));
    };

    if (requestSignal) {
      requestSignal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

async function waitForConcurrencySlot(
  limit: number,
  requestSignal?: AbortSignal
): Promise<void> {
  return waitForSlot(
    limit,
    () => activeCalls,
    () => {
      activeCalls += 1;
    },
    slotWaiters,
    requestSignal
  );
}

function tryWakeNextBatchWaiter(): void {
  const next = batchSlotWaiters.shift();
  if (next !== undefined) {
    next();
  }
}

async function waitForBatchConcurrencySlot(
  limit: number,
  requestSignal?: AbortSignal
): Promise<void> {
  return waitForSlot(
    limit,
    () => activeBatchCalls,
    () => {
      activeBatchCalls += 1;
    },
    batchSlotWaiters,
    requestSignal
  );
}

interface BatchApiClient {
  batches?: {
    create: (payload: Record<string, unknown>) => Promise<unknown>;
    get: (payload: { name: string }) => Promise<unknown>;
    cancel?: (payload: { name: string }) => Promise<unknown>;
  };
}

const BatchHelper = {
  getState(payload: unknown): string | undefined {
    const record = toRecord(payload);
    if (!record) {
      return undefined;
    }

    const directState = toUpperStringCode(record.state);
    if (directState) {
      return directState;
    }

    const metadata = toRecord(record.metadata);
    if (!metadata) {
      return undefined;
    }

    return toUpperStringCode(metadata.state);
  },

  getResponseText(payload: unknown): string | undefined {
    const record = toRecord(payload);
    if (!record) {
      return undefined;
    }

    const inlineResponse = toRecord(record.inlineResponse);
    const inlineText =
      typeof inlineResponse?.text === 'string'
        ? inlineResponse.text
        : undefined;
    if (inlineText) {
      return inlineText;
    }

    const response = toRecord(record.response);
    if (!response) {
      return undefined;
    }

    const responseText =
      typeof response.text === 'string' ? response.text : undefined;
    if (responseText) {
      return responseText;
    }

    const { inlineResponses } = response;
    if (!Array.isArray(inlineResponses) || inlineResponses.length === 0) {
      return undefined;
    }

    const firstInline = toRecord(inlineResponses[0]);
    return typeof firstInline?.text === 'string' ? firstInline.text : undefined;
  },

  getErrorDetail(payload: unknown): string | undefined {
    const record = toRecord(payload);
    if (!record) {
      return undefined;
    }

    const directError = toRecord(record.error);
    const directMessage =
      typeof directError?.message === 'string'
        ? directError.message
        : undefined;
    if (directMessage) {
      return directMessage;
    }

    const metadata = toRecord(record.metadata);
    const metadataError = toRecord(metadata?.error);
    const metadataMessage =
      typeof metadataError?.message === 'string'
        ? metadataError.message
        : undefined;
    if (metadataMessage) {
      return metadataMessage;
    }

    const response = toRecord(record.response);
    const responseError = toRecord(response?.error);
    return typeof responseError?.message === 'string'
      ? responseError.message
      : undefined;
  },

  getSuccessResponseText(polled: unknown): string {
    const responseText = this.getResponseText(polled);
    if (!responseText) {
      const errorDetail = this.getErrorDetail(polled);
      throw new Error(
        errorDetail
          ? `Gemini batch request succeeded but returned no response text: ${errorDetail}`
          : 'Gemini batch request succeeded but returned no response text.'
      );
    }

    return responseText;
  },

  handleTerminalState(state: string | undefined, payload: unknown): void {
    if (state === 'JOB_STATE_FAILED' || state === 'JOB_STATE_CANCELLED') {
      const errorDetail = this.getErrorDetail(payload);
      throw new Error(
        errorDetail
          ? `Gemini batch request ended with state ${state}: ${errorDetail}`
          : `Gemini batch request ended with state ${state}.`
      );
    }
  },
};

async function pollBatchStatusWithRetries(
  batches: NonNullable<BatchApiClient['batches']>,
  batchName: string,
  onLog: GeminiOnLog,
  requestSignal?: AbortSignal
): Promise<unknown> {
  const maxPollRetries = 2;

  for (let attempt = 0; attempt <= maxPollRetries; attempt += 1) {
    try {
      return await batches.get({ name: batchName });
    } catch (error: unknown) {
      if (!canRetryAttempt(attempt, maxPollRetries, error)) {
        throw error;
      }

      await waitBeforeRetry(attempt, error, onLog, requestSignal);
    }
  }

  throw new Error('Batch polling retries exhausted unexpectedly.');
}

async function cancelBatchIfNeeded(
  request: GeminiStructuredRequest,
  batches: NonNullable<BatchApiClient['batches']>,
  batchName: string | undefined,
  onLog: GeminiOnLog,
  completed: boolean,
  timedOut: boolean
): Promise<void> {
  const aborted = request.signal?.aborted === true;
  if (completed || (!aborted && !timedOut) || !batchName) {
    return;
  }

  if (batches.cancel === undefined) {
    return;
  }

  try {
    await batches.cancel({ name: batchName });
    await emitGeminiLog(onLog, 'info', {
      event: 'gemini_batch_cancelled',
      details: {
        batchName,
        reason: timedOut ? 'timeout' : 'aborted',
      },
    });
  } catch (error: unknown) {
    await emitGeminiLog(onLog, 'warning', {
      event: 'gemini_batch_cancel_failed',
      details: {
        batchName,
        reason: timedOut ? 'timeout' : 'aborted',
        error: getErrorMessage(error),
      },
    });
  }
}

async function runInlineBatchWithPolling(
  request: GeminiStructuredRequest,
  model: string,
  onLog: GeminiOnLog
): Promise<unknown> {
  const client = getClient() as unknown as BatchApiClient;
  const { batches } = client;
  if (batches === undefined) {
    throw new Error(
      'Batch mode requires SDK batch support, but batches API is unavailable.'
    );
  }

  let batchName: string | undefined;
  let completed = false;
  let timedOut = false;

  try {
    const createPayload: Record<string, unknown> = {
      model,
      src: [
        {
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
          config: buildGenerationConfig(request, new AbortController().signal),
        },
      ],
    };
    const createdJob = await batches.create(createPayload);
    const createdRecord = toRecord(createdJob);
    batchName =
      typeof createdRecord?.name === 'string' ? createdRecord.name : undefined;
    if (!batchName) {
      throw new Error('Batch mode failed to return a job name.');
    }

    const pollStart = performance.now();
    const timeoutMs = batchTimeoutMsConfig.get();
    const pollIntervalMs = batchPollIntervalMsConfig.get();

    await emitGeminiLog(onLog, 'info', {
      event: 'gemini_batch_created',
      details: { batchName },
    });

    for (;;) {
      if (request.signal?.aborted === true) {
        throw new Error('Gemini request was cancelled.');
      }

      const elapsedMs = Math.round(performance.now() - pollStart);
      if (elapsedMs > timeoutMs) {
        timedOut = true;
        throw new Error(
          `Gemini batch request timed out after ${formatNumber(timeoutMs)}ms.`
        );
      }

      const polled = await pollBatchStatusWithRetries(
        batches,
        batchName,
        onLog,
        request.signal
      );
      const state = BatchHelper.getState(polled);

      if (state === 'JOB_STATE_SUCCEEDED') {
        const responseText = BatchHelper.getSuccessResponseText(polled);
        completed = true;
        return parseStructuredResponse(responseText);
      }

      BatchHelper.handleTerminalState(state, polled);

      await sleep(
        pollIntervalMs,
        undefined,
        request.signal
          ? { ...SLEEP_UNREF_OPTIONS, signal: request.signal }
          : SLEEP_UNREF_OPTIONS
      );
    }
  } finally {
    await cancelBatchIfNeeded(
      request,
      batches,
      batchName,
      onLog,
      completed,
      timedOut
    );
  }
}

export function getGeminiQueueSnapshot(): {
  activeCalls: number;
  waitingCalls: number;
} {
  return {
    activeCalls,
    waitingCalls: slotWaiters.length,
  };
}

export async function generateStructuredJson(
  request: GeminiStructuredRequest
): Promise<unknown> {
  const model = request.model ?? getDefaultModel();
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = request.maxRetries ?? DEFAULT_MAX_RETRIES;
  const batchMode = request.batchMode ?? getDefaultBatchMode();
  const { onLog } = request;

  const limit =
    batchMode === 'inline'
      ? maxConcurrentBatchCallsConfig.get()
      : maxConcurrentCallsConfig.get();
  const queueWaitStartedAt = performance.now();
  if (batchMode === 'inline') {
    await waitForBatchConcurrencySlot(limit, request.signal);
  } else {
    await waitForConcurrencySlot(limit, request.signal);
  }
  const queueWaitMs = Math.round(performance.now() - queueWaitStartedAt);

  await safeCallOnLog(onLog, 'info', {
    event: 'gemini_queue_acquired',
    queueWaitMs,
    waitingCalls:
      batchMode === 'inline' ? batchSlotWaiters.length : slotWaiters.length,
    activeCalls,
    activeBatchCalls,
    mode: batchMode,
  });

  try {
    return await geminiContext.run(
      { requestId: nextRequestId(), model },
      () => {
        if (batchMode === 'inline') {
          return runInlineBatchWithPolling(request, model, onLog);
        }

        return runWithRetries(request, model, timeoutMs, maxRetries, onLog);
      }
    );
  } finally {
    if (batchMode === 'inline') {
      activeBatchCalls -= 1;
      tryWakeNextBatchWaiter();
    } else {
      activeCalls -= 1;
      tryWakeNextWaiter();
    }
  }
}
