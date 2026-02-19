import { createErrorToolResponse } from './tool-response.js';

const DEFAULT_MAX_CONTEXT_CHARS = 500_000;
interface FileContent {
  content: string;
}

function getMaxContextChars(): number {
  const maxEnv = process.env['MAX_CONTEXT_CHARS'];
  return maxEnv ? parseInt(maxEnv, 10) : DEFAULT_MAX_CONTEXT_CHARS;
}

export function computeContextSize(
  diff: string,
  files?: FileContent[]
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
  files?: FileContent[]
): ReturnType<typeof createErrorToolResponse> | undefined {
  const size = computeContextSize(diff, files);
  const max = getMaxContextChars();

  if (size > max) {
    return createErrorToolResponse(
      'E_INPUT_TOO_LARGE',
      `Combined context size ${size} chars exceeds limit of ${max} chars.`
    );
  }
  return undefined;
}
