import { createCachedEnvInt } from '../lib/env-config.js';
import { toInlineCode } from '../lib/markdown.js';
import { FLASH_MODEL } from '../lib/model-config.js';
import { getToolContracts } from '../lib/tool-contracts.js';

const DEFAULT_MAX_DIFF_CHARS = 120_000;
const DEFAULT_MAX_CONCURRENT_CALLS = 10;
const DEFAULT_CONCURRENT_WAIT_MS = 2_000;
const DEFAULT_SAFETY_THRESHOLD = 'BLOCK_NONE';

const GEMINI_HARM_BLOCK_THRESHOLD_ENV_VAR = 'GEMINI_HARM_BLOCK_THRESHOLD';
const GEMINI_MODEL_ENV_VAR = 'GEMINI_MODEL';
const GEMINI_BATCH_MODE_ENV_VAR = 'GEMINI_BATCH_MODE';

const diffCharsConfig = createCachedEnvInt(
  'MAX_DIFF_CHARS',
  DEFAULT_MAX_DIFF_CHARS
);
const concurrentCallsConfig = createCachedEnvInt(
  'MAX_CONCURRENT_CALLS',
  DEFAULT_MAX_CONCURRENT_CALLS
);
const concurrentBatchCallsConfig = createCachedEnvInt(
  'MAX_CONCURRENT_BATCH_CALLS',
  2
);
const concurrentWaitConfig = createCachedEnvInt(
  'MAX_CONCURRENT_CALLS_WAIT_MS',
  DEFAULT_CONCURRENT_WAIT_MS
);

function getModelOverride(): string {
  return process.env[GEMINI_MODEL_ENV_VAR] ?? FLASH_MODEL;
}

function getBatchMode(): string {
  return process.env[GEMINI_BATCH_MODE_ENV_VAR] ?? 'off';
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

function formatThinkingLevel(level: string | undefined): string {
  return level ?? '—';
}

export function buildServerConfig(): string {
  const maxDiffChars = diffCharsConfig.get();
  const maxConcurrent = concurrentCallsConfig.get();
  const maxConcurrentBatch = concurrentBatchCallsConfig.get();
  const concurrentWaitMs = concurrentWaitConfig.get();
  const defaultModel = getModelOverride();
  const batchMode = getBatchMode();
  const safetyThreshold = getSafetyThreshold();
  const toolRows = getToolContracts()
    .filter((contract) => contract.model !== 'none')
    .map((contract) => {
      return `| ${toInlineCode(contract.name)} | ${toInlineCode(contract.model)} | ${formatThinkingLevel(contract.thinkingLevel)} | ${formatTimeout(contract.timeoutMs)} | ${formatNumber(contract.maxOutputTokens)} |`;
    })
    .join('\n');

  return `# Server Configuration

## Input Limits

| Limit | Value | Env |
|-------|-------|-----|
| Diff limit | ${formatNumber(maxDiffChars)} chars | ${toInlineCode('MAX_DIFF_CHARS')} |
| Concurrency limit | ${maxConcurrent} | ${toInlineCode('MAX_CONCURRENT_CALLS')} |
| Batch concurrency limit | ${maxConcurrentBatch} | ${toInlineCode('MAX_CONCURRENT_BATCH_CALLS')} |
| Wait timeout | ${formatNumber(concurrentWaitMs)}ms | ${toInlineCode('MAX_CONCURRENT_CALLS_WAIT_MS')} |
| Batch mode | ${batchMode} | ${toInlineCode('GEMINI_BATCH_MODE')} |

## Model Assignments

Default model: ${toInlineCode(defaultModel)} (override with ${toInlineCode('GEMINI_MODEL')})

| Tool | Model | Thinking Level | Timeout | Max Output Tokens |
|------|-------|----------------|---------|-------------------|
${toolRows}

## Safety

- Harm block threshold: ${toInlineCode(safetyThreshold)}
- Override with ${toInlineCode('GEMINI_HARM_BLOCK_THRESHOLD')} (BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE)

## API Keys

- Set ${toInlineCode('GEMINI_API_KEY')} or ${toInlineCode('GOOGLE_API_KEY')} environment variable (required)

## Batch Mode

- ${toInlineCode('GEMINI_BATCH_MODE')}: ${toInlineCode('off')} (default) or ${toInlineCode('inline')}
- ${toInlineCode('GEMINI_BATCH_POLL_INTERVAL_MS')}: poll cadence for batch status checks
- ${toInlineCode('GEMINI_BATCH_TIMEOUT_MS')}: max wait for batch completion
`;
}
