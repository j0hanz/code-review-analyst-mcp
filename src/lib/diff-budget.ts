import { createErrorToolResponse, type ErrorMeta } from './tool-response.js';

const DEFAULT_MAX_DIFF_CHARS = 120_000;
const MAX_DIFF_CHARS_ENV_VAR = 'MAX_DIFF_CHARS';

const numberFormatter = new Intl.NumberFormat('en-US');

// Lazy-cached: first call happens after parseCommandLineArgs() sets MAX_DIFF_CHARS.
let cachedMaxDiffChars: number | undefined;

function parsePositiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function getConfiguredMaxDiffChars(): number {
  const envValue = process.env[MAX_DIFF_CHARS_ENV_VAR] ?? '';
  return parsePositiveInteger(envValue) ?? DEFAULT_MAX_DIFF_CHARS;
}

export function getMaxDiffChars(): number {
  if (cachedMaxDiffChars !== undefined) {
    return cachedMaxDiffChars;
  }

  cachedMaxDiffChars = getConfiguredMaxDiffChars();
  return cachedMaxDiffChars;
}

export function resetMaxDiffCharsCacheForTesting(): void {
  cachedMaxDiffChars = undefined;
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
