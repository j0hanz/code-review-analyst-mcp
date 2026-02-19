import { createErrorToolResponse } from './tool-response.js';

const DEFAULT_MAX_CONTEXT_CHARS = 500_000;

export function computeContextSize(
  diff: string,
  files?: { content: string }[]
): number {
  let size = diff.length;
  if (files) {
    for (const file of files) {
      size += file.content.length;
    }
  }
  return size;
}

export function validateContextBudget(
  diff: string,
  files?: { content: string }[]
): ReturnType<typeof createErrorToolResponse> | undefined {
  const size = computeContextSize(diff, files);
  const maxEnv = process.env['MAX_CONTEXT_CHARS'];
  const max = maxEnv ? parseInt(maxEnv, 10) : DEFAULT_MAX_CONTEXT_CHARS;

  if (size > max) {
    return createErrorToolResponse(
      'E_INPUT_TOO_LARGE',
      `Combined context size ${size} chars exceeds limit of ${max} chars.`
    );
  }
  return undefined;
}
