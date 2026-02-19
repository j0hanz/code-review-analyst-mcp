import { inspect } from 'node:util';

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function hasMessageProperty(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

export function getErrorMessage(error: unknown): string {
  if (hasMessageProperty(error)) {
    return error.message;
  }

  if (isString(error)) {
    return error;
  }

  return inspect(error, { depth: 3, breakLength: 120 });
}
