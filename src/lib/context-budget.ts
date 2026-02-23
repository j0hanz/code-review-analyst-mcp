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

function computeFilesSize(files: readonly FileContent[]): number {
  let total = 0;
  for (const file of files) {
    total += file.content.length;
  }
  return total;
}

function createContextBudgetMessage(size: number, max: number): string {
  return `Combined context size ${size} chars exceeds limit of ${max} chars.`;
}

export function resetMaxContextCharsCacheForTesting(): void {
  contextCharsConfig.reset();
}

function getMaxContextChars(): number {
  return contextCharsConfig.get();
}

export function computeContextSize(
  diff: string,
  files?: readonly FileContent[]
): number {
  if (!files || files.length === 0) {
    return diff.length;
  }

  return diff.length + computeFilesSize(files);
}

export function validateContextBudget(
  diff: string,
  files?: readonly FileContent[]
): ReturnType<typeof createErrorToolResponse> | undefined {
  const size = computeContextSize(diff, files);
  const max = getMaxContextChars();

  if (size > max) {
    return createErrorToolResponse(
      'E_INPUT_TOO_LARGE',
      createContextBudgetMessage(size, max),
      { providedChars: size, maxChars: max },
      BUDGET_ERROR_META
    );
  }
  return undefined;
}
