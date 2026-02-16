import { createErrorToolResponse } from './tool-response.js';

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function createErrorResponse(
  code: string,
  message: string,
  result?: unknown
): ReturnType<typeof createErrorToolResponse> {
  return createErrorToolResponse(code, message, result);
}
