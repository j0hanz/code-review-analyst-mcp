import { inspect } from 'node:util';

/**
 * Unified superset pattern for retryable upstream errors.
 * Used by both the Gemini adapter and the tool-task factory to classify errors consistently.
 */
export const RETRYABLE_UPSTREAM_ERROR_PATTERN =
  /(429|500|502|503|504|rate.?limit|quota|overload|unavailable|gateway|timeout|timed.out|connection|reset|econn|enotfound|temporary|transient|invalid.json)/i;

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function hasStringProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<K, string> {
  const record = value as Record<K, unknown>;
  return (
    typeof value === 'object' &&
    value !== null &&
    key in value &&
    typeof record[key] === 'string'
  );
}

export function getErrorMessage(error: unknown): string {
  if (hasStringProperty(error, 'message')) {
    return error.message;
  }

  if (isString(error)) {
    return error;
  }

  return inspect(error, { depth: 3, breakLength: 120 });
}
