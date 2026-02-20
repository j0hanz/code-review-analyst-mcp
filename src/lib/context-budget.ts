import { createCachedEnvInt } from './env-config.js';
import { createErrorToolResponse } from './tool-response.js';

const DEFAULT_MAX_CONTEXT_CHARS = 500_000;
const MAX_CONTEXT_CHARS_ENV_VAR = 'MAX_CONTEXT_CHARS';
const BUDGET_ERROR_META = { retryable: false, kind: 'budget' } as const;

const contextCharsConfig = createCachedEnvInt(
  MAX_CONTEXT_CHARS_ENV_VAR,
  DEFAULT_MAX_CONTEXT_CHARS
);

interface FileContent {
  content: string;
}

export function resetMaxContextCharsCacheForTesting(): void {
  contextCharsConfig.reset();
}

function getMaxContextChars(): number {
  return contextCharsConfig.get();
}

export function computeContextSize(
  diff: string,
  files?: FileContent[]
): number {
  const fileSize = files
    ? files.reduce((total, file) => total + file.content.length, 0)
    : 0;
  return diff.length + fileSize;
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
      `Combined context size ${size} chars exceeds limit of ${max} chars.`,
      { providedChars: size, maxChars: max },
      BUDGET_ERROR_META
    );
  }
  return undefined;
}
