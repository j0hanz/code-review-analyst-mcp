import { randomInt } from 'node:crypto';

import {
  getErrorMessage,
  RETRYABLE_UPSTREAM_ERROR_PATTERN,
  toRecord,
} from './errors.js';

const DIGITS_ONLY_PATTERN = /^\d+$/;
const RETRY_DELAY_BASE_MS = 300;
const RETRY_DELAY_MAX_MS = 5_000;
const RETRY_JITTER_RATIO = 0.2;

export const RETRYABLE_NUMERIC_CODES = new Set([429, 500, 502, 503, 504]);

export const RETRYABLE_TRANSIENT_CODES = new Set([
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
  'INTERNAL',
  'ABORTED',
]);

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

export function toUpperStringCode(candidate: unknown): string | undefined {
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

export function getNumericErrorCode(error: unknown): number | undefined {
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

export function shouldRetry(error: unknown): boolean {
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

export function getRetryDelayMs(attempt: number): number {
  const exponentialDelay = RETRY_DELAY_BASE_MS * 2 ** attempt;
  const boundedDelay = Math.min(RETRY_DELAY_MAX_MS, exponentialDelay);
  const jitterWindow = Math.max(
    1,
    Math.floor(boundedDelay * RETRY_JITTER_RATIO)
  );
  const jitter = randomInt(0, jitterWindow);
  return Math.min(RETRY_DELAY_MAX_MS, boundedDelay + jitter);
}

export function canRetryAttempt(
  attempt: number,
  maxRetries: number,
  error: unknown
): boolean {
  return attempt < maxRetries && shouldRetry(error);
}
