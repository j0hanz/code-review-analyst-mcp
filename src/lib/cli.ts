import { parseArgs } from 'node:util';

const ARG_OPTION_MODEL = 'model';
const ARG_OPTION_MAX_DIFF_CHARS = 'max-diff-chars';
const PROCESS_ARGS_START_INDEX = 2;

const CLI_ENV_MAPPINGS = [
  { option: ARG_OPTION_MODEL, envVar: 'GEMINI_MODEL' },
  { option: ARG_OPTION_MAX_DIFF_CHARS, envVar: 'MAX_DIFF_CHARS' },
] as const;

const CLI_OPTIONS = {
  [ARG_OPTION_MODEL]: {
    type: 'string',
    short: 'm',
  },
  [ARG_OPTION_MAX_DIFF_CHARS]: {
    type: 'string',
  },
} as const;

function setStringEnv(name: string, value: string | boolean | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
  }
}

function applyCliEnvironmentOverrides(
  values: Record<string, string | boolean | undefined>
): void {
  for (const mapping of CLI_ENV_MAPPINGS) {
    setStringEnv(mapping.envVar, values[mapping.option]);
  }
}

export function parseCommandLineArgs(): void {
  const { values } = parseArgs({
    args: process.argv.slice(PROCESS_ARGS_START_INDEX),
    options: CLI_OPTIONS,
    strict: false,
  });

  applyCliEnvironmentOverrides(values);
}
