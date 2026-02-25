export function toBulletedList(lines: readonly string[]): string {
  return lines.map((line) => `- ${line}`).join('\n');
}

export function toInlineCode(value: string): string {
  return `\`${value}\``;
}
