import { inspect } from 'node:util';

/// Guides for using specific tools in code review analysis.
export const RETRYABLE_UPSTREAM_ERROR_PATTERN =
  /(429|500|502|503|504|rate.?limit|quota|overload|unavailable|gateway|timeout|timed.out|connection|reset|econn|enotfound|temporary|transient|invalid.json)/i;

function hasStringProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<K, string> {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return false;
  }

  const record = value as Record<K, unknown>;
  return typeof record[key] === 'string';
}

export function getErrorMessage(error: unknown): string {
  if (hasStringProperty(error, 'message')) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return inspect(error, { depth: 3, breakLength: 120 });
}
