import { createCachedEnvInt } from './env-config.js';
import { createErrorToolResponse, type ErrorMeta } from './tool-response.js';

const DEFAULT_MAX_DIFF_CHARS = 120_000;
const MAX_DIFF_CHARS_ENV_VAR = 'MAX_DIFF_CHARS';

const numberFormatter = new Intl.NumberFormat('en-US');

const diffCharsConfig = createCachedEnvInt(
  MAX_DIFF_CHARS_ENV_VAR,
  DEFAULT_MAX_DIFF_CHARS
);

export function getMaxDiffChars(): number {
  return diffCharsConfig.get();
}

export function resetMaxDiffCharsCacheForTesting(): void {
  diffCharsConfig.reset();
}

export function exceedsDiffBudget(diff: string): boolean {
  return diff.length > getMaxDiffChars();
}

export function getDiffBudgetError(diffLength: number): string {
  return `diff exceeds max allowed size (${numberFormatter.format(diffLength)} chars > ${numberFormatter.format(getMaxDiffChars())} chars)`;
}

const BUDGET_ERROR_META: ErrorMeta = { retryable: false, kind: 'budget' };

export function validateDiffBudget(
  diff: string
): ReturnType<typeof createErrorToolResponse> | undefined {
  const providedChars = diff.length;
  if (!exceedsDiffBudget(diff)) {
    return undefined;
  }

  const maxChars = getMaxDiffChars();

  return createErrorToolResponse(
    'E_INPUT_TOO_LARGE',
    getDiffBudgetError(providedChars),
    { providedChars, maxChars },
    BUDGET_ERROR_META
  );
}
