import { inspect } from 'node:util';

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
