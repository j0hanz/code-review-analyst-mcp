/** Fast, cost-effective model for summarization and light analysis. */
export const FLASH_MODEL = 'gemini-2.5-flash';

/** High-capability model for deep reasoning, quality inspection, and reliable code generation. */
export const PRO_MODEL = 'gemini-2.5-pro';

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

const THINKING_BUDGET_TOKENS = {
  /** Disabled (0) for triage/classification. */
  flashTriage: 0,
  /** ~50% of Flash max (16k). For analysis tasks. */
  flash: 16_384,
  /** ~75% of Pro max (24k). For deep review and patches. */
  pro: 24_576,
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

/** Thinking budget for Flash triage (disabled). */
export const FLASH_TRIAGE_THINKING_BUDGET = THINKING_BUDGET_TOKENS.flashTriage;

/** Thinking budget for Flash analysis. */
export const FLASH_THINKING_BUDGET = THINKING_BUDGET_TOKENS.flash;

/** Thinking budget for Pro deep analysis. */
export const PRO_THINKING_BUDGET = THINKING_BUDGET_TOKENS.pro;

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
  analysis: 0.1, // Consistent algorithmic analysis
  creative: 0.2, // Modest diversity (e.g. test plans)
  patch: 0.0, // Max precision for code blocks
  triage: 0.1, // Deterministic extraction
} as const;

/** Temperature for analytical tools. */
export const ANALYSIS_TEMPERATURE = TOOL_TEMPERATURE.analysis;

/** Temperature for creative synthesis (test plans). */
export const CREATIVE_TEMPERATURE = TOOL_TEMPERATURE.creative;

/** Temperature for code patch generation. */
export const PATCH_TEMPERATURE = TOOL_TEMPERATURE.patch;

/** Temperature for triage/classification tools. */
export const TRIAGE_TEMPERATURE = TOOL_TEMPERATURE.triage;
