/** Fast, cost-effective model for summarization and light analysis. */
export const FLASH_MODEL = 'gemini-3-flash-preview';

/** High-capability model for deep reasoning, quality inspection, and reliable code generation. */
export const PRO_MODEL = 'gemini-3.1-pro-preview';

/** Default hint for auto-detection. */
const DEFAULT_DETECT_HINT = 'detect';

/** Default language hint. */
export const DEFAULT_LANGUAGE = DEFAULT_DETECT_HINT;

/** Default test-framework hint. */
export const DEFAULT_FRAMEWORK = DEFAULT_DETECT_HINT;

/** Extended timeout for Pro model calls (ms). */
export const DEFAULT_TIMEOUT_PRO_MS = 120_000;

export const MODEL_TIMEOUT_MS = {
  defaultPro: DEFAULT_TIMEOUT_PRO_MS,
} as const;
Object.freeze(MODEL_TIMEOUT_MS);

// ---------------------------------------------------------------------------
// Budgets (Thinking & Output)
// ---------------------------------------------------------------------------

const THINKING_LEVELS = {
  /** Minimal thinking for triage/classification. */
  flashTriage: 'minimal',
  /** Medium thinking for analysis tasks. */
  flash: 'medium',
  /** High thinking for deep review and patches. */
  pro: 'high',
} as const;

// Thinking budget in tokens for Flash and Pro tools. Note that these are not hard limits, but rather guidelines to encourage concise responses and manage latency/cost.
const OUTPUT_TOKEN_BUDGET = {
  flashApiBreaking: 4_096,
  flashComplexity: 2_048,
  flashTestPlan: 8_192,
  flashTriage: 4_096,
  proPatch: 8_192,
  proReview: 12_288,
} as const;

/** Thinking level for Flash triage. */
export const FLASH_TRIAGE_THINKING_LEVEL = THINKING_LEVELS.flashTriage;

/** Thinking level for Flash analysis. */
export const FLASH_THINKING_LEVEL = THINKING_LEVELS.flash;

/** Thinking level for Pro deep analysis. */
export const PRO_THINKING_LEVEL = THINKING_LEVELS.pro;

/** Output cap for Flash API breaking-change detection. */
export const FLASH_API_BREAKING_MAX_OUTPUT_TOKENS =
  OUTPUT_TOKEN_BUDGET.flashApiBreaking;

/** Output cap for Flash complexity analysis. */
export const FLASH_COMPLEXITY_MAX_OUTPUT_TOKENS =
  OUTPUT_TOKEN_BUDGET.flashComplexity;

/** Output cap for Flash test-plan generation. */
export const FLASH_TEST_PLAN_MAX_OUTPUT_TOKENS =
  OUTPUT_TOKEN_BUDGET.flashTestPlan;

/** Output cap for Flash triage tools. */
export const FLASH_TRIAGE_MAX_OUTPUT_TOKENS = OUTPUT_TOKEN_BUDGET.flashTriage;

/** Output cap for Pro patch generation. */
export const PRO_PATCH_MAX_OUTPUT_TOKENS = OUTPUT_TOKEN_BUDGET.proPatch;

/** Output cap for Pro deep review findings. */
export const PRO_REVIEW_MAX_OUTPUT_TOKENS = OUTPUT_TOKEN_BUDGET.proReview;

// ---------------------------------------------------------------------------
// Temperatures
// ---------------------------------------------------------------------------

const TOOL_TEMPERATURE = {
  analysis: 1.0, // Gemini 3 recommends 1.0 for all tasks
  creative: 1.0, // Gemini 3 recommends 1.0 for all tasks
  patch: 1.0, // Gemini 3 recommends 1.0 for all tasks
  triage: 1.0, // Gemini 3 recommends 1.0 for all tasks
} as const;

/** Temperature for analytical tools. */
export const ANALYSIS_TEMPERATURE = TOOL_TEMPERATURE.analysis;

/** Temperature for creative synthesis (test plans). */
export const CREATIVE_TEMPERATURE = TOOL_TEMPERATURE.creative;

/** Temperature for code patch generation. */
export const PATCH_TEMPERATURE = TOOL_TEMPERATURE.patch;

/** Temperature for triage/classification tools. */
export const TRIAGE_TEMPERATURE = TOOL_TEMPERATURE.triage;
