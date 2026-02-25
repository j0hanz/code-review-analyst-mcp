import { inspect } from 'node:util';

/** Matches transient upstream provider failures that are typically safe to retry. */
export const RETRYABLE_UPSTREAM_ERROR_PATTERN =
  /(429|500|502|503|504|rate.?limit|quota|overload|unavailable|gateway|timeout|timed.out|connection|reset|econn|enotfound|temporary|transient|invalid.json)/i;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStringProperty(value: unknown, key: string): string | undefined {
  if (!isObjectRecord(value) || !(key in value)) {
    return undefined;
  }

  const property = value[key];
  return typeof property === 'string' ? property : undefined;
}

export function getErrorMessage(error: unknown): string {
  const message = getStringProperty(error, 'message');
  if (message !== undefined) {
    return message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return inspect(error, { depth: 3, breakLength: 120 });
}
