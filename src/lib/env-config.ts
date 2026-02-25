export interface CachedEnvInt {
  get(): number;
  reset(): void;
}

function parsePositiveInteger(value: string): number | undefined {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
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
