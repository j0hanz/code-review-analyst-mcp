import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
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

import { ConcurrencyLimiter } from './concurrency.js';
import { formatUsNumber } from './contract-format.js';
import { createCachedEnvInt } from './env-config.js';
import { getErrorMessage, toRecord } from './errors.js';
import {
  canRetryAttempt,
  getNumericErrorCode,
  getRetryDelayMs,
  toUpperStringCode,
} from './gemini-retry.js';
import type { GeminiStructuredRequest } from './types.js';

// Lazy-cached: first call happens after parseCommandLineArgs() sets GEMINI_MODEL.
let _defaultModel: string | undefined;
const DEFAULT_MODEL = 'gemini-3-flash-preview';
const MODEL_FALLBACK_TARGET = 'gemini-2.5-flash';
const GEMINI_MODEL_ENV_VAR = 'GEMINI_MODEL';
const GEMINI_HARM_BLOCK_THRESHOLD_ENV_VAR = 'GEMINI_HARM_BLOCK_THRESHOLD';
const GEMINI_INCLUDE_THOUGHTS_ENV_VAR = 'GEMINI_INCLUDE_THOUGHTS';
const GEMINI_BATCH_MODE_ENV_VAR = 'GEMINI_BATCH_MODE';
const GEMINI_API_KEY_ENV_VAR = 'GEMINI_API_KEY';
const GOOGLE_API_KEY_ENV_VAR = 'GOOGLE_API_KEY';
type GeminiOnLog = GeminiStructuredRequest['onLog'];

function getDefaultModel(): string {
  _defaultModel ??= process.env[GEMINI_MODEL_ENV_VAR] ?? DEFAULT_MODEL;
  return _defaultModel;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const DEFAULT_SAFETY_THRESHOLD = HarmBlockThreshold.BLOCK_NONE;
const DEFAULT_INCLUDE_THOUGHTS = false;
const DEFAULT_BATCH_MODE = 'off';
const UNKNOWN_REQUEST_CONTEXT_VALUE = 'unknown';
const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);
const SLEEP_UNREF_OPTIONS = { ref: false } as const;
const JSON_CODE_BLOCK_PATTERN = /```(?:json)?\n?([\s\S]*?)(?=\n?```)/u;
const NEVER_ABORT_SIGNAL = new AbortController().signal;
const CANCELLED_REQUEST_MESSAGE = 'Gemini request was cancelled.';

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

const callLimiter = new ConcurrencyLimiter(
  () => maxConcurrentCallsConfig.get(),
  () => concurrencyWaitMsConfig.get(),
  (limit, ms) => formatConcurrencyLimitErrorMessage(limit, ms),
  () => CANCELLED_REQUEST_MESSAGE
);

const batchCallLimiter = new ConcurrencyLimiter(
  () => maxConcurrentBatchCallsConfig.get(),
  () => concurrencyWaitMsConfig.get(),
  (limit, ms) => formatConcurrencyLimitErrorMessage(limit, ms),
  () => CANCELLED_REQUEST_MESSAGE
);
const SAFETY_CATEGORIES = [
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
] as const;

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

const THINKING_LEVEL_MAP: Record<string, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

function getThinkingConfig(
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high' | undefined,
  includeThoughts: boolean
): { thinkingLevel?: ThinkingLevel; includeThoughts?: true } | undefined {
  if (!thinkingLevel && !includeThoughts) {
    return undefined;
  }

  return {
    ...(thinkingLevel
      ? { thinkingLevel: THINKING_LEVEL_MAP[thinkingLevel] }
      : {}),
    ...(includeThoughts ? { includeThoughts: true } : {}),
  };
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

  const settings = SAFETY_CATEGORIES.map((category) => ({
    category,
    threshold,
  }));
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

function throwIfRequestCancelled(requestSignal?: AbortSignal): void {
  if (requestSignal?.aborted) {
    throw new Error(CANCELLED_REQUEST_MESSAGE);
  }
}

function getSleepOptions(signal?: AbortSignal): Parameters<typeof sleep>[2] {
  return signal ? { ...SLEEP_UNREF_OPTIONS, signal } : SLEEP_UNREF_OPTIONS;
}

function parseStructuredResponse(responseText: string | undefined): unknown {
  if (!responseText) {
    throw new Error('Gemini returned an empty response body.');
  }

  try {
    return JSON.parse(responseText);
  } catch {
    // fast-path failed; try extracting from markdown block
  }

  const jsonMatch = JSON_CODE_BLOCK_PATTERN.exec(responseText);
  const jsonText = jsonMatch?.[1] ?? responseText;

  try {
    return JSON.parse(jsonText);
  } catch (error: unknown) {
    throw new Error(`Model produced invalid JSON: ${getErrorMessage(error)}`, {
      cause: error,
    });
  }
}

function formatTimeoutErrorMessage(timeoutMs: number): string {
  return `Gemini request timed out after ${formatUsNumber(timeoutMs)}ms.`;
}

function formatConcurrencyLimitErrorMessage(
  limit: number,
  waitLimitMs: number
): string {
  return `Too many concurrent Gemini calls (limit: ${formatUsNumber(limit)}; waited ${formatUsNumber(waitLimitMs)}ms).`;
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
    throwIfRequestCancelled(request.signal);

    if (controller.signal.aborted) {
      throw new Error(formatTimeoutErrorMessage(timeoutMs), { cause: error });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractThoughtsFromParts(parts: unknown): string | undefined {
  if (!Array.isArray(parts)) {
    return undefined;
  }

  const thoughtParts = parts.filter(
    (part) =>
      typeof part === 'object' &&
      part !== null &&
      (part as { thought?: unknown }).thought === true &&
      typeof (part as { text?: unknown }).text === 'string'
  ) as { text: string }[];

  if (thoughtParts.length === 0) {
    return undefined;
  }

  return thoughtParts.map((part) => part.text).join('\n\n');
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
  const thoughts = extractThoughtsFromParts(
    response.candidates?.[0]?.content?.parts
  );

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
      `Response truncated: model output exceeds limit (maxOutputTokens=${formatUsNumber(limit)}). Increase maxOutputTokens or reduce prompt complexity.`
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

  throwIfRequestCancelled(requestSignal);

  try {
    await sleep(delayMs, undefined, getSleepOptions(requestSignal));
  } catch (sleepError: unknown) {
    throwIfRequestCancelled(requestSignal);

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

function shouldUseModelFallback(error: unknown, model: string): boolean {
  return getNumericErrorCode(error) === 404 && model === DEFAULT_MODEL;
}

async function applyModelFallback(
  request: GeminiStructuredRequest,
  onLog: GeminiOnLog,
  reason: string
): Promise<{ model: string; request: GeminiStructuredRequest }> {
  await emitGeminiLog(onLog, 'warning', {
    event: 'gemini_model_fallback',
    details: {
      from: DEFAULT_MODEL,
      to: MODEL_FALLBACK_TARGET,
      reason,
    },
  });

  return {
    model: MODEL_FALLBACK_TARGET,
    request: omitThinkingLevel(request),
  };
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
  let currentModel = model;
  let effectiveRequest: GeminiStructuredRequest = request;

  for (; attempt <= maxRetries; attempt += 1) {
    try {
      return await executeAttempt(
        effectiveRequest,
        currentModel,
        timeoutMs,
        attempt,
        onLog
      );
    } catch (error: unknown) {
      lastError = error;

      if (shouldUseModelFallback(error, currentModel)) {
        const fallback = await applyModelFallback(
          request,
          onLog,
          'Model not found (404)'
        );
        currentModel = fallback.model;
        effectiveRequest = fallback.request;
        continue;
      }

      if (!canRetryAttempt(attempt, maxRetries, error)) {
        attempt += 1; // Count this attempt before breaking
        break;
      }

      await waitBeforeRetry(attempt, error, onLog, request.signal);
    }
  }

  return throwGeminiFailure(attempt, lastError, onLog);
}

/**
 * Returns a shallow copy of the request with `thinkingLevel` removed.
 * Uses Reflect.deleteProperty to satisfy `exactOptionalPropertyTypes` —
 * the property must be absent, not explicitly set to `undefined`.
 */
function omitThinkingLevel(
  request: GeminiStructuredRequest
): GeminiStructuredRequest {
  const copy = { ...request };
  Reflect.deleteProperty(copy, 'thinkingLevel');
  return copy;
}

type ExecutionMode = 'off' | 'inline';

function isInlineBatchMode(mode: ExecutionMode): mode is 'inline' {
  return mode === 'inline';
}

async function acquireQueueSlot(
  mode: ExecutionMode,
  requestSignal?: AbortSignal
): Promise<{ queueWaitMs: number; waitingCalls: number }> {
  const queueWaitStartedAt = performance.now();

  if (isInlineBatchMode(mode)) {
    await batchCallLimiter.acquire(requestSignal);
  } else {
    await callLimiter.acquire(requestSignal);
  }

  return {
    queueWaitMs: Math.round(performance.now() - queueWaitStartedAt),
    waitingCalls: isInlineBatchMode(mode)
      ? batchCallLimiter.pendingCount
      : callLimiter.pendingCount,
  };
}

function releaseQueueSlot(mode: ExecutionMode): void {
  if (isInlineBatchMode(mode)) {
    batchCallLimiter.release();
    return;
  }
  callLimiter.release();
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
    if (!record) return undefined;

    const directState = toUpperStringCode(record.state);
    if (directState) return directState;

    const metadata = toRecord(record.metadata);
    return metadata ? toUpperStringCode(metadata.state) : undefined;
  },

  getResponseText(payload: unknown): string | undefined {
    const record = toRecord(payload);
    if (!record) return undefined;

    // Try inlineResponse.text
    const inline = toRecord(record.inlineResponse);
    if (typeof inline?.text === 'string') return inline.text;

    const response = toRecord(record.response);
    if (!response) return undefined;

    // Try response.text
    if (typeof response.text === 'string') return response.text;

    // Try response.inlineResponses[0].text
    if (
      Array.isArray(response.inlineResponses) &&
      response.inlineResponses.length > 0
    ) {
      const first = toRecord(response.inlineResponses[0]);
      if (typeof first?.text === 'string') return first.text;
    }

    return undefined;
  },

  getErrorDetail(payload: unknown): string | undefined {
    const record = toRecord(payload);
    if (!record) return undefined;

    // Try error.message
    const directError = toRecord(record.error);
    if (typeof directError?.message === 'string') return directError.message;

    // Try metadata.error.message
    const metadata = toRecord(record.metadata);
    const metaError = toRecord(metadata?.error);
    if (typeof metaError?.message === 'string') return metaError.message;

    // Try response.error.message
    const response = toRecord(record.response);
    const respError = toRecord(response?.error);
    return typeof respError?.message === 'string'
      ? respError.message
      : undefined;
  },

  getSuccessResponseText(polled: unknown): string {
    const text = this.getResponseText(polled);
    if (text) return text;

    const err = this.getErrorDetail(polled);
    throw new Error(
      err
        ? `Gemini batch request succeeded but returned no response text: ${err}`
        : 'Gemini batch request succeeded but returned no response text.'
    );
  },

  handleTerminalState(state: string | undefined, payload: unknown): void {
    if (state === 'JOB_STATE_FAILED' || state === 'JOB_STATE_CANCELLED') {
      const err = this.getErrorDetail(payload);
      throw new Error(
        err
          ? `Gemini batch request ended with state ${state}: ${err}`
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
  const shouldCancel = !completed && (aborted || timedOut);

  if (!shouldCancel || !batchName || !batches.cancel) {
    return;
  }

  const reason = timedOut ? 'timeout' : 'aborted';
  try {
    await batches.cancel({ name: batchName });
    await emitGeminiLog(onLog, 'info', {
      event: 'gemini_batch_cancelled',
      details: { batchName, reason },
    });
  } catch (error: unknown) {
    await emitGeminiLog(onLog, 'warning', {
      event: 'gemini_batch_cancel_failed',
      details: {
        batchName,
        reason,
        error: getErrorMessage(error),
      },
    });
  }
}

async function createBatchJobWithFallback(
  request: GeminiStructuredRequest,
  batches: NonNullable<BatchApiClient['batches']>,
  model: string,
  onLog: GeminiOnLog
): Promise<unknown> {
  let currentModel = model;
  let effectiveRequest: GeminiStructuredRequest = request;
  const createSignal = request.signal ?? NEVER_ABORT_SIGNAL;

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      const createPayload: Record<string, unknown> = {
        model: currentModel,
        src: [
          {
            contents: [
              { role: 'user', parts: [{ text: effectiveRequest.prompt }] },
            ],
            config: buildGenerationConfig(effectiveRequest, createSignal),
          },
        ],
      };
      return await batches.create(createPayload);
    } catch (error: unknown) {
      if (attempt === 0 && shouldUseModelFallback(error, currentModel)) {
        const fallback = await applyModelFallback(
          request,
          onLog,
          'Model not found (404) during batch create'
        );
        currentModel = fallback.model;
        effectiveRequest = fallback.request;
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    'Unexpected state: batch creation loop exited without returning or throwing.'
  );
}

async function pollBatchForCompletion(
  batches: NonNullable<BatchApiClient['batches']>,
  batchName: string,
  onLog: GeminiOnLog,
  requestSignal?: AbortSignal
): Promise<unknown> {
  const pollIntervalMs = batchPollIntervalMsConfig.get();
  const timeoutMs = batchTimeoutMsConfig.get();
  const pollStart = performance.now();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    throwIfRequestCancelled(requestSignal);

    const elapsedMs = Math.round(performance.now() - pollStart);
    if (elapsedMs > timeoutMs) {
      throw new Error(
        `Gemini batch request timed out after ${formatUsNumber(timeoutMs)}ms.`
      );
    }

    const polled = await pollBatchStatusWithRetries(
      batches,
      batchName,
      onLog,
      requestSignal
    );
    const state = BatchHelper.getState(polled);

    if (state === 'JOB_STATE_SUCCEEDED') {
      const responseText = BatchHelper.getSuccessResponseText(polled);
      return parseStructuredResponse(responseText);
    }

    BatchHelper.handleTerminalState(state, polled);
    await sleep(pollIntervalMs, undefined, getSleepOptions(requestSignal));
  }
}

async function runInlineBatchWithPolling(
  request: GeminiStructuredRequest,
  model: string,
  onLog: GeminiOnLog
): Promise<unknown> {
  const client = getClient() as unknown as BatchApiClient;
  const { batches } = client;
  if (!batches) {
    throw new Error(
      'Batch mode requires SDK batch support, but batches API is unavailable.'
    );
  }

  let batchName: string | undefined;
  let completed = false;
  let timedOut = false;

  try {
    const createdJob = await createBatchJobWithFallback(
      request,
      batches,
      model,
      onLog
    );
    const createdRecord = toRecord(createdJob);
    batchName =
      typeof createdRecord?.name === 'string' ? createdRecord.name : undefined;

    if (!batchName) throw new Error('Batch mode failed to return a job name.');

    await emitGeminiLog(onLog, 'info', {
      event: 'gemini_batch_created',
      details: { batchName },
    });

    const result = await pollBatchForCompletion(
      batches,
      batchName,
      onLog,
      request.signal
    );
    completed = true;
    return result;
  } catch (error: unknown) {
    if (getErrorMessage(error).includes('timed out')) {
      timedOut = true;
    }
    throw error;
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
  activeWaiters: number;
  activeCalls: number;
  activeBatchWaiters: number;
  activeBatchCalls: number;
} {
  return {
    activeWaiters: callLimiter.pendingCount,
    activeCalls: callLimiter.active,
    activeBatchWaiters: batchCallLimiter.pendingCount,
    activeBatchCalls: batchCallLimiter.active,
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
  const { queueWaitMs, waitingCalls } = await acquireQueueSlot(
    batchMode,
    request.signal
  );

  await safeCallOnLog(onLog, 'info', {
    event: 'gemini_queue_acquired',
    queueWaitMs,
    waitingCalls,
    activeCalls: callLimiter.active,
    activeBatchCalls: batchCallLimiter.active,
    mode: batchMode,
  });

  try {
    return await geminiContext.run(
      { requestId: nextRequestId(), model },
      () => {
        if (isInlineBatchMode(batchMode)) {
          return runInlineBatchWithPolling(request, model, onLog);
        }

        return runWithRetries(request, model, timeoutMs, maxRetries, onLog);
      }
    );
  } finally {
    releaseQueueSlot(batchMode);
  }
}
