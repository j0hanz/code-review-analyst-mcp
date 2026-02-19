import { createErrorToolResponse } from './tool-response.js';

const DEFAULT_MAX_CONTEXT_CHARS = 500_000;
const MAX_CONTEXT_CHARS_ENV_VAR = 'MAX_CONTEXT_CHARS';
const BUDGET_ERROR_META = { retryable: false, kind: 'budget' } as const;
interface FileContent {
  content: string;
}

function parsePositiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function getMaxContextChars(): number {
  const envValue = process.env[MAX_CONTEXT_CHARS_ENV_VAR] ?? '';
  return parsePositiveInteger(envValue) ?? DEFAULT_MAX_CONTEXT_CHARS;
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
