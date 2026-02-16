import { createErrorToolResponse } from './tool-response.js';

const DEFAULT_MAX_DIFF_CHARS = 120_000;
const MAX_DIFF_CHARS_ENV_VAR = 'MAX_DIFF_CHARS';

function getPositiveIntEnv(name: string): number | undefined {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getMaxDiffChars(): number {
  return getPositiveIntEnv(MAX_DIFF_CHARS_ENV_VAR) ?? DEFAULT_MAX_DIFF_CHARS;
}

export function exceedsDiffBudget(diff: string): boolean {
  return diff.length > getMaxDiffChars();
}

export function getDiffBudgetError(diffLength: number): string {
  return `diff exceeds max allowed size (${diffLength} chars > ${getMaxDiffChars()} chars)`;
}

export function validateDiffBudget(
  diff: string
): ReturnType<typeof createErrorToolResponse> | undefined {
  if (!exceedsDiffBudget(diff)) {
    return undefined;
  }

  return createErrorToolResponse(
    'E_INPUT_TOO_LARGE',
    getDiffBudgetError(diff.length)
  );
}
