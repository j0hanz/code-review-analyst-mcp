export interface CachedEnvInt {
  get(): number;
  reset(): void;
}

function parsePositiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

/// Creates a cached integer value from an environment variable, with a default fallback.
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

      const envValue = process.env[envVar] ?? '';
      cached = parsePositiveInteger(envValue) ?? defaultValue;
      return cached;
    },

    reset(): void {
      cached = undefined;
    },
  };
}
