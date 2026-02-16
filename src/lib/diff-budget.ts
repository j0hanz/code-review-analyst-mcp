const DEFAULT_MAX_DIFF_CHARS = 120_000;
const MAX_DIFF_CHARS_ENV_VAR = 'MAX_DIFF_CHARS';

function getPositiveIntEnv(name: string): number | undefined {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export const MAX_DIFF_CHARS =
  getPositiveIntEnv(MAX_DIFF_CHARS_ENV_VAR) ?? DEFAULT_MAX_DIFF_CHARS;

export function exceedsDiffBudget(diff: string): boolean {
  return diff.length > MAX_DIFF_CHARS;
}

export function getDiffBudgetError(diffLength: number): string {
  return `diff exceeds max allowed size (${diffLength} chars > ${MAX_DIFF_CHARS} chars)`;
}
