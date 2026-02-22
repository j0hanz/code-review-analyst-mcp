import {
  ANALYSIS_TEMPERATURE,
  CREATIVE_TEMPERATURE,
  DEFAULT_TIMEOUT_PRO_MS,
  FLASH_API_BREAKING_MAX_OUTPUT_TOKENS,
  FLASH_COMPLEXITY_MAX_OUTPUT_TOKENS,
  FLASH_MODEL,
  FLASH_TEST_PLAN_MAX_OUTPUT_TOKENS,
  FLASH_THINKING_LEVEL,
  FLASH_TRIAGE_MAX_OUTPUT_TOKENS,
  FLASH_TRIAGE_THINKING_LEVEL,
  PATCH_TEMPERATURE,
  PRO_MODEL,
  PRO_PATCH_MAX_OUTPUT_TOKENS,
  PRO_REVIEW_MAX_OUTPUT_TOKENS,
  PRO_THINKING_LEVEL,
  TRIAGE_TEMPERATURE,
} from './model-config.js';

const DEFAULT_TIMEOUT_FLASH_MS = 90_000;

export const INSPECTION_FOCUS_AREAS = [
  'security',
  'correctness',
  'performance',
  'regressions',
  'tests',
  'maintainability',
  'concurrency',
] as const;

export interface ToolParameterContract {
  name: string;
  type: string;
  required: boolean;
  constraints: string;
  description: string;
}

export interface ToolContract {
  name: string;
  purpose: string;
  /** Set to 'none' for synchronous (non-Gemini) tools. */
  model: string;
  /** Set to 0 for synchronous (non-Gemini) tools. */
  timeoutMs: number;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  /** Set to 0 for synchronous (non-Gemini) tools. */
  maxOutputTokens: number;
  /**
   * Sampling temperature for the Gemini call.
   * Gemini 3 recommends 1.0 for all tasks.
   */
  temperature?: number;
  /** Enables deterministic JSON guidance and schema key ordering. */
  deterministicJson?: boolean;
  params: readonly ToolParameterContract[];
  outputShape: string;
  gotchas: readonly string[];
  crossToolFlow: readonly string[];
  constraints?: readonly string[];
}

export const TOOL_CONTRACTS = [
  {
    name: 'generate_diff',
    purpose:
      'Generate a diff of current changes and cache it server-side. MUST be called before any other tool. Uses git to capture unstaged or staged changes in the current working directory.',
    model: 'none',
    timeoutMs: 0,
    maxOutputTokens: 0,
    params: [
      {
        name: 'mode',
        type: 'string',
        required: true,
        constraints: "'unstaged' | 'staged'",
        description:
          "'unstaged': working tree changes not yet staged. 'staged': changes added to the index (git add).",
      },
    ],
    outputShape:
      '{ok, result: {diffRef, stats{files, added, deleted}, generatedAt, mode, message}}',
    gotchas: [
      'Must be called first — all other tools return E_NO_DIFF if no diff is cached.',
      'Noisy files (lock files, dist/, build/, minified assets) are excluded automatically.',
      'Empty diff (no changes) returns E_NO_CHANGES.',
    ],
    crossToolFlow: [
      'Caches diff at diff://current — consumed automatically by all review tools.',
    ],
  },
  {
    name: 'analyze_pr_impact',
    purpose:
      'Assess severity, categories, breaking changes, and rollback complexity.',
    model: FLASH_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_FLASH_MS,
    thinkingLevel: FLASH_TRIAGE_THINKING_LEVEL,
    maxOutputTokens: FLASH_TRIAGE_MAX_OUTPUT_TOKENS,
    temperature: TRIAGE_TEMPERATURE,
    deterministicJson: true,
    params: [
      {
        name: 'repository',
        type: 'string',
        required: true,
        constraints: '1-200 chars',
        description: 'Repository identifier (org/repo).',
      },
      {
        name: 'language',
        type: 'string',
        required: false,
        constraints: '2-32 chars',
        description: 'Primary language hint.',
      },
    ],
    outputShape:
      '{severity, categories[], summary, breakingChanges[], affectedAreas[], rollbackComplexity}',
    gotchas: [
      'Requires generate_diff to be called first.',
      'Flash triage tool optimized for speed.',
    ],
    crossToolFlow: [
      'severity/categories feed triage and merge-gate decisions.',
    ],
  },
  {
    name: 'generate_review_summary',
    purpose: 'Produce PR summary, risk rating, and merge recommendation.',
    model: FLASH_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_FLASH_MS,
    thinkingLevel: FLASH_TRIAGE_THINKING_LEVEL,
    maxOutputTokens: FLASH_TRIAGE_MAX_OUTPUT_TOKENS,
    temperature: TRIAGE_TEMPERATURE,
    deterministicJson: true,
    params: [
      {
        name: 'repository',
        type: 'string',
        required: true,
        constraints: '1-200 chars',
        description: 'Repository identifier (org/repo).',
      },
      {
        name: 'language',
        type: 'string',
        required: false,
        constraints: '2-32 chars',
        description: 'Primary language hint.',
      },
    ],
    outputShape:
      '{summary, overallRisk, keyChanges[], recommendation, stats{filesChanged, linesAdded, linesRemoved}}',
    gotchas: [
      'Requires generate_diff to be called first.',
      'stats are computed locally from the diff.',
    ],
    crossToolFlow: [
      'Use before deep review to decide whether Pro analysis is needed.',
    ],
  },
  {
    name: 'inspect_code_quality',
    purpose: 'Deep code review with optional full-file context.',
    model: PRO_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_PRO_MS,
    thinkingLevel: PRO_THINKING_LEVEL,
    maxOutputTokens: PRO_REVIEW_MAX_OUTPUT_TOKENS,
    temperature: ANALYSIS_TEMPERATURE,
    deterministicJson: true,
    params: [
      {
        name: 'repository',
        type: 'string',
        required: true,
        constraints: '1-200 chars',
        description: 'Repository identifier (org/repo).',
      },
      {
        name: 'language',
        type: 'string',
        required: false,
        constraints: '2-32 chars',
        description: 'Primary language hint.',
      },
      {
        name: 'focusAreas',
        type: 'string[]',
        required: false,
        constraints: '1-12 items, 2-80 chars each',
        description: `Focused inspection categories (e.g. ${INSPECTION_FOCUS_AREAS.join(', ')}).`,
      },
      {
        name: 'maxFindings',
        type: 'number',
        required: false,
        constraints: '1-25',
        description: 'Post-generation cap applied to findings.',
      },
      {
        name: 'files',
        type: 'object[]',
        required: false,
        constraints: '1-20 files, 100K chars/file',
        description: 'Optional full file content context.',
      },
    ],
    outputShape:
      '{summary, overallRisk, findings[], testsNeeded[], contextualInsights[], totalFindings}',
    gotchas: [
      'Requires generate_diff to be called first.',
      'Combined diff + file context is bounded by MAX_CONTEXT_CHARS.',
      'maxFindings caps output after generation.',
    ],
    crossToolFlow: [
      'findings[].title -> suggest_search_replace.findingTitle',
      'findings[].explanation -> suggest_search_replace.findingDetails',
    ],
    constraints: ['Context budget (diff + files) < 500K chars.'],
  },
  {
    name: 'suggest_search_replace',
    purpose: 'Generate verbatim search/replace fix blocks for one finding.',
    model: PRO_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_PRO_MS,
    thinkingLevel: PRO_THINKING_LEVEL,
    maxOutputTokens: PRO_PATCH_MAX_OUTPUT_TOKENS,
    temperature: PATCH_TEMPERATURE,
    deterministicJson: true,
    params: [
      {
        name: 'findingTitle',
        type: 'string',
        required: true,
        constraints: '3-160 chars',
        description: 'Short finding title.',
      },
      {
        name: 'findingDetails',
        type: 'string',
        required: true,
        constraints: '10-3000 chars',
        description: 'Detailed finding context.',
      },
    ],
    outputShape: '{summary, blocks[], validationChecklist[]}',
    gotchas: [
      'Requires generate_diff to be called first.',
      'One finding per call to avoid mixed patch intent.',
      'search must be exact whitespace-preserving match.',
    ],
    crossToolFlow: [
      'Consumes findings from inspect_code_quality for targeted fixes.',
    ],
    constraints: ['One finding per call; verbatim search match required.'],
  },
  {
    name: 'generate_test_plan',
    purpose: 'Generate prioritized test cases and coverage guidance.',
    model: FLASH_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_FLASH_MS,
    thinkingLevel: FLASH_THINKING_LEVEL,
    maxOutputTokens: FLASH_TEST_PLAN_MAX_OUTPUT_TOKENS,
    temperature: CREATIVE_TEMPERATURE,
    deterministicJson: true,
    params: [
      {
        name: 'repository',
        type: 'string',
        required: true,
        constraints: '1-200 chars',
        description: 'Repository identifier (org/repo).',
      },
      {
        name: 'language',
        type: 'string',
        required: false,
        constraints: '2-32 chars',
        description: 'Primary language hint.',
      },
      {
        name: 'testFramework',
        type: 'string',
        required: false,
        constraints: '1-50 chars',
        description: 'Framework hint (jest, vitest, pytest, node:test).',
      },
      {
        name: 'maxTestCases',
        type: 'number',
        required: false,
        constraints: '1-30',
        description: 'Post-generation cap applied to test cases.',
      },
    ],
    outputShape: '{summary, testCases[], coverageSummary}',
    gotchas: [
      'Requires generate_diff to be called first.',
      'maxTestCases caps output after generation.',
    ],
    crossToolFlow: [
      'Pair with inspect_code_quality to validate high-risk paths.',
    ],
  },
  {
    name: 'analyze_time_space_complexity',
    purpose:
      'Analyze Big-O complexity and detect degradations in changed code.',
    model: FLASH_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_FLASH_MS,
    thinkingLevel: FLASH_THINKING_LEVEL,
    maxOutputTokens: FLASH_COMPLEXITY_MAX_OUTPUT_TOKENS,
    temperature: ANALYSIS_TEMPERATURE,
    deterministicJson: true,
    params: [
      {
        name: 'language',
        type: 'string',
        required: false,
        constraints: '2-32 chars',
        description: 'Primary language hint.',
      },
    ],
    outputShape:
      '{timeComplexity, spaceComplexity, explanation, potentialBottlenecks[], isDegradation}',
    gotchas: [
      'Requires generate_diff to be called first.',
      'Analyzes only changed code visible in the diff.',
    ],
    crossToolFlow: ['Use for algorithmic/performance-sensitive changes.'],
  },
  {
    name: 'detect_api_breaking_changes',
    purpose: 'Detect breaking API/interface changes in a diff.',
    model: FLASH_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_FLASH_MS,
    thinkingLevel: FLASH_TRIAGE_THINKING_LEVEL,
    maxOutputTokens: FLASH_API_BREAKING_MAX_OUTPUT_TOKENS,
    temperature: TRIAGE_TEMPERATURE,
    deterministicJson: true,
    params: [
      {
        name: 'language',
        type: 'string',
        required: false,
        constraints: '2-32 chars',
        description: 'Primary language hint.',
      },
    ],
    outputShape: '{hasBreakingChanges, breakingChanges[]}',
    gotchas: [
      'Requires generate_diff to be called first.',
      'Targets public API contracts over internal refactors.',
    ],
    crossToolFlow: ['Run before merge for API-surface-sensitive changes.'],
  },
] as const satisfies readonly ToolContract[];

const TOOL_CONTRACTS_BY_NAME = new Map<string, ToolContract>(
  TOOL_CONTRACTS.map((contract) => [contract.name, contract])
);

export function getToolContracts(): readonly ToolContract[] {
  return TOOL_CONTRACTS;
}

export function getToolContract(toolName: string): ToolContract | undefined {
  return TOOL_CONTRACTS_BY_NAME.get(toolName);
}

export function requireToolContract(toolName: string): ToolContract {
  const contract = getToolContract(toolName);
  if (contract) {
    return contract;
  }

  throw new Error(`Unknown tool contract: ${toolName}`);
}

export function getToolContractNames(): string[] {
  return TOOL_CONTRACTS.map((contract) => contract.name);
}
