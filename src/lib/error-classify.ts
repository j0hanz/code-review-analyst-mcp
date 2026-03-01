import { z } from 'zod';

import { RETRYABLE_UPSTREAM_ERROR_PATTERN } from './errors.js';
import type { ErrorMeta } from './tool-response.js';

const CANCELLED_ERROR_PATTERN = /cancelled|canceled/i;
const TIMEOUT_ERROR_PATTERN = /timed out|timeout/i;
const BUDGET_ERROR_PATTERN = /exceeds limit|max allowed size|input too large/i;
const BUSY_ERROR_PATTERN = /too many concurrent/i;
const VALIDATION_ERROR_PATTERN = /validation/i;

export { CANCELLED_ERROR_PATTERN };

const ERROR_CLASSIFIERS: { pattern: RegExp; meta: ErrorMeta }[] = [
  {
    pattern: CANCELLED_ERROR_PATTERN,
    meta: { kind: 'cancelled', retryable: false },
  },
  {
    pattern: TIMEOUT_ERROR_PATTERN,
    meta: { kind: 'timeout', retryable: true },
  },
  { pattern: BUDGET_ERROR_PATTERN, meta: { kind: 'budget', retryable: false } },
  { pattern: BUSY_ERROR_PATTERN, meta: { kind: 'busy', retryable: true } },
  {
    pattern: RETRYABLE_UPSTREAM_ERROR_PATTERN,
    meta: { kind: 'upstream', retryable: true },
  },
];

export function classifyErrorMeta(error: unknown, message: string): ErrorMeta {
  if (error instanceof z.ZodError || VALIDATION_ERROR_PATTERN.test(message)) {
    return {
      kind: 'validation',
      retryable: false,
    };
  }

  for (const { pattern, meta } of ERROR_CLASSIFIERS) {
    if (pattern.test(message)) {
      return meta;
    }
  }

  return {
    kind: 'internal',
    retryable: false,
  };
}
