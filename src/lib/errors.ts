import { inspect } from 'node:util';

import { createErrorToolResponse } from './tool-response.js';

function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return inspect(error, { depth: 3, breakLength: 120 });
}

export function createErrorResponse(
  code: string,
  message: string,
  result?: unknown
): ReturnType<typeof createErrorToolResponse> {
  return createErrorToolResponse(code, message, result);
}
