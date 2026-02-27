const usNumberFormatter = new Intl.NumberFormat('en-US');

export function formatUsNumber(value: number): string {
  return usNumberFormatter.format(value);
}

export function formatTimeoutSeconds(timeoutMs: number): string {
  return `${Math.round(timeoutMs / 1_000)}s`;
}

export function formatThinkingLevel(
  thinkingLevel: string | undefined,
  fallback = '-'
): string {
  return thinkingLevel ?? fallback;
}
