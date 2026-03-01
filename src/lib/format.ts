export function formatOptionalLine(
  label: string,
  value: string | number | undefined
): string {
  return value === undefined ? '' : `\n${label}: ${value}`;
}

export function formatLanguageSegment(language: string | undefined): string {
  return formatOptionalLine('Language', language);
}

export function formatCountLabel(
  count: number,
  singular: string,
  plural: string
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
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
export function toBulletedList(lines: readonly string[]): string {
  return lines.map((line) => `- ${line}`).join('\n');
}

export function toInlineCode(value: string): string {
  return `\`${value}\``;
}
