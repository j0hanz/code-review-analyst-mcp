import { inspect } from 'node:util';

import { createErrorToolResponse } from './tool-response.js';

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
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
