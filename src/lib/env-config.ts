export interface CachedEnvInt {
  get(): number;
  reset(): void;
}

function parsePositiveInteger(value: string): number | undefined {
  if (value.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function resolveEnvInt(envVar: string, defaultValue: number): number {
  const envValue = process.env[envVar] ?? '';
  return parsePositiveInteger(envValue) ?? defaultValue;
}

/** Creates a cached integer value from an environment variable, with a default fallback. */
export function createCachedEnvInt(
  envVar: string,
  defaultValue: number
): CachedEnvInt {
  let cached: number | undefined;

  return {
    get(): number {
      if (cached !== undefined) {
        return cached;
      }

      cached = resolveEnvInt(envVar, defaultValue);
      return cached;
    },

    reset(): void {
      cached = undefined;
    },
  };
}
