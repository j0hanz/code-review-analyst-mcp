import { z } from 'zod';

import { RETRYABLE_UPSTREAM_ERROR_PATTERN } from './errors.js';
import type { ErrorMeta } from './tool-response.js';

const CANCELLED_ERROR_PATTERN = /cancelled|canceled/i;
const TIMEOUT_ERROR_PATTERN = /timed out|timeout/i;
const BUDGET_ERROR_PATTERN = /exceeds limit|max allowed size|input too large/i;
const BUSY_ERROR_PATTERN = /too many concurrent/i;
const VALIDATION_ERROR_PATTERN = /validation/i;

export { CANCELLED_ERROR_PATTERN };

export function classifyErrorMeta(error: unknown, message: string): ErrorMeta {
  if (error instanceof z.ZodError || VALIDATION_ERROR_PATTERN.test(message)) {
    return {
      kind: 'validation',
      retryable: false,
    };
  }

  if (CANCELLED_ERROR_PATTERN.test(message)) {
    return {
      kind: 'cancelled',
      retryable: false,
    };
  }

  if (TIMEOUT_ERROR_PATTERN.test(message)) {
    return {
      kind: 'timeout',
      retryable: true,
    };
  }

  if (BUDGET_ERROR_PATTERN.test(message)) {
    return {
      kind: 'budget',
      retryable: false,
    };
  }

  if (BUSY_ERROR_PATTERN.test(message)) {
    return {
      kind: 'busy',
      retryable: true,
    };
  }

  if (RETRYABLE_UPSTREAM_ERROR_PATTERN.test(message)) {
    return {
      kind: 'upstream',
      retryable: true,
    };
  }

  return {
    kind: 'internal',
    retryable: false,
  };
}
