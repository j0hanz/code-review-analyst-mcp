import { createErrorToolResponse } from './tool-response.js';

const DEFAULT_MAX_DIFF_CHARS = 120_000;
const MAX_DIFF_CHARS_ENV_VAR = 'MAX_DIFF_CHARS';

const numberFormatter = new Intl.NumberFormat('en-US');

// Lazy-cached: first call happens after parseCommandLineArgs() sets MAX_DIFF_CHARS.
let _maxDiffChars: number | undefined;

function parsePositiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function getMaxDiffChars(): number {
  if (_maxDiffChars !== undefined) return _maxDiffChars;

  const value =
    parsePositiveInteger(process.env[MAX_DIFF_CHARS_ENV_VAR] ?? '') ??
    DEFAULT_MAX_DIFF_CHARS;
  _maxDiffChars = value;
  return value;
}

export function exceedsDiffBudget(diff: string): boolean {
  return diff.length > getMaxDiffChars();
}

export function getDiffBudgetError(diffLength: number): string {
  return `diff exceeds max allowed size (${numberFormatter.format(diffLength)} chars > ${numberFormatter.format(getMaxDiffChars())} chars)`;
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
