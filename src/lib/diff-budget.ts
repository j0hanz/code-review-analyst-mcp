const DEFAULT_MAX_DIFF_CHARS = 120_000;

const parsedMaxDiffChars = Number.parseInt(
  process.env.MAX_DIFF_CHARS ?? '',
  10
);

export const MAX_DIFF_CHARS =
  Number.isFinite(parsedMaxDiffChars) && parsedMaxDiffChars > 0
    ? parsedMaxDiffChars
    : DEFAULT_MAX_DIFF_CHARS;

export function exceedsDiffBudget(diff: string): boolean {
  return diff.length > MAX_DIFF_CHARS;
}

export function getDiffBudgetError(diffLength: number): string {
  return `diff exceeds max allowed size (${diffLength} chars > ${MAX_DIFF_CHARS} chars)`;
}
