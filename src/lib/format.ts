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
