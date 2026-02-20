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
  const maxChars = getMaxDiffChars();
  return getDiffLength(diff) > maxChars;
}

function formatDiffBudgetError(diffLength: number, maxChars: number): string {
  return `diff exceeds max allowed size (${numberFormatter.format(diffLength)} chars > ${numberFormatter.format(maxChars)} chars)`;
}

export function getDiffBudgetError(
  diffLength: number,
  maxChars = getMaxDiffChars()
): string {
  return formatDiffBudgetError(diffLength, maxChars);
}

const BUDGET_ERROR_META: ErrorMeta = { retryable: false, kind: 'budget' };

function getDiffLength(diff: string): number {
  return diff.length;
}

export function validateDiffBudget(
  diff: string
): ReturnType<typeof createErrorToolResponse> | undefined {
  const providedChars = getDiffLength(diff);
  const maxChars = getMaxDiffChars();
  if (providedChars <= maxChars) {
    return undefined;
  }

  return createErrorToolResponse(
    'E_INPUT_TOO_LARGE',
    formatDiffBudgetError(providedChars, maxChars),
    { providedChars, maxChars },
    BUDGET_ERROR_META
  );
}
