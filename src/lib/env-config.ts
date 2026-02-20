export interface CachedEnvInt {
  get(): number;
  reset(): void;
}

function parsePositiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

/**
 * Creates a lazy-cached integer from an environment variable.
 * The first call to get() reads and caches the env var. reset() clears the cache.
 */
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
