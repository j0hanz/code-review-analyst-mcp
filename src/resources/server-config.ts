import { createCachedEnvInt } from '../lib/env-config.js';
import { FLASH_MODEL } from '../lib/model-config.js';
import { getToolContracts } from '../lib/tool-contracts.js';

const DEFAULT_MAX_DIFF_CHARS = 120_000;
const DEFAULT_MAX_CONTEXT_CHARS = 500_000;
const DEFAULT_MAX_CONCURRENT_CALLS = 10;
const DEFAULT_CONCURRENT_WAIT_MS = 2_000;
const DEFAULT_SAFETY_THRESHOLD = 'BLOCK_NONE';

const GEMINI_HARM_BLOCK_THRESHOLD_ENV_VAR = 'GEMINI_HARM_BLOCK_THRESHOLD';
const GEMINI_MODEL_ENV_VAR = 'GEMINI_MODEL';

const diffCharsConfig = createCachedEnvInt(
  'MAX_DIFF_CHARS',
  DEFAULT_MAX_DIFF_CHARS
);
const contextCharsConfig = createCachedEnvInt(
  'MAX_CONTEXT_CHARS',
  DEFAULT_MAX_CONTEXT_CHARS
);
const concurrentCallsConfig = createCachedEnvInt(
  'MAX_CONCURRENT_CALLS',
  DEFAULT_MAX_CONCURRENT_CALLS
);
const concurrentWaitConfig = createCachedEnvInt(
  'MAX_CONCURRENT_CALLS_WAIT_MS',
  DEFAULT_CONCURRENT_WAIT_MS
);

function getModelOverride(): string {
  return process.env[GEMINI_MODEL_ENV_VAR] ?? FLASH_MODEL;
}

function getSafetyThreshold(): string {
  return (
    process.env[GEMINI_HARM_BLOCK_THRESHOLD_ENV_VAR] ?? DEFAULT_SAFETY_THRESHOLD
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatTimeout(ms: number): string {
  return `${Math.round(ms / 1_000)}s`;
}

function formatThinkingBudget(budget: number | undefined): string {
  return budget !== undefined ? formatNumber(budget) : '—';
}

export function buildServerConfig(): string {
  const maxDiffChars = diffCharsConfig.get();
  const maxContextChars = contextCharsConfig.get();
  const maxConcurrent = concurrentCallsConfig.get();
  const concurrentWaitMs = concurrentWaitConfig.get();
  const defaultModel = getModelOverride();
  const safetyThreshold = getSafetyThreshold();
  const toolRows = getToolContracts()
    .map((contract) => {
      return `| \`${contract.name}\` | \`${contract.model}\` | ${formatThinkingBudget(contract.thinkingBudget)} | ${formatTimeout(contract.timeoutMs)} | ${formatNumber(contract.maxOutputTokens)} |`;
    })
    .join('\n');

  return `# Server Configuration

## Input Limits

| Limit | Value | Env |
|-------|-------|-----|
| Diff limit | ${formatNumber(maxDiffChars)} chars | \`MAX_DIFF_CHARS\` |
| Context limit (inspect) | ${formatNumber(maxContextChars)} chars | \`MAX_CONTEXT_CHARS\` |
| Concurrency limit | ${maxConcurrent} | \`MAX_CONCURRENT_CALLS\` |
| Wait timeout | ${formatNumber(concurrentWaitMs)}ms | \`MAX_CONCURRENT_CALLS_WAIT_MS\` |

## Model Assignments

Default model: \`${defaultModel}\` (override with \`GEMINI_MODEL\`)

| Tool | Model | Thinking Budget | Timeout | Max Output Tokens |
|------|-------|----------------|---------|-------------------|
${toolRows}

## Safety

- Harm block threshold: \`${safetyThreshold}\`
- Override with \`GEMINI_HARM_BLOCK_THRESHOLD\` (BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE)

## API Keys

- Set \`GEMINI_API_KEY\` or \`GOOGLE_API_KEY\` environment variable (required)
`;
}
