/** Fast, cost-effective model for summarization and light analysis. */
export const FLASH_MODEL = 'gemini-2.5-flash';

/** High-capability model for deep reasoning, quality inspection, and reliable code generation. */
export const PRO_MODEL = 'gemini-2.5-pro';

const THINKING_BUDGET_TOKENS = {
  /**
   * Disabled (0): triage/classification tasks need no reasoning chain.
   * Flash 2.5 range: 0–24_576; 0 explicitly disables thinking.
   */
  flashTriage: 0,
  /**
   * Raised from 8_192 → half of Flash max (24_576).
   * Used for analysis tasks (test plans, complexity) that benefit from
   * multi-step reasoning but not from unbounded thinking tokens.
   */
  flash: 16_384,
  /**
   * Raised from 16_384 → 75 % of Pro max (32_768).
   * Gives deep-review and patch-generation tools genuine headroom for
   * complex multi-file diffs without switching to cost-unpredictable dynamic.
   */
  pro: 24_576,
} as const;

const OUTPUT_TOKEN_BUDGET = {
  flashTriage: 4_096,
  /**
   * Raised from 4_096: 15 test cases × pseudoCode@2_000 chars ≈ 7_500 tokens;
   * staying at 4_096 risked MAX_TOKENS truncation on moderate test plans.
   */
  flashTestPlan: 8_192,
  flashApiBreaking: 4_096,
  flashComplexity: 2_048,
  /**
   * Raised from 8_192: 25 findings × (title+explanation+recommendation) can
   * exceed 8_192 tokens for rich, high-finding-count reviews.
   */
  proReview: 12_288,
  /**
   * Raised from 4_096: 10 search/replace blocks with multi-line code context
   * can exceed the previous cap and cause MAX_TOKENS truncation.
   */
  proPatch: 8_192,
} as const;

/**
 * Per-task temperature presets for structured JSON generation.
 * These are intentionally low: the model is already heavily constrained by
 * the responseSchema, so lower temperatures improve schema-validation
 * pass-through rates and reduce hallucinated field values.
 */
const TOOL_TEMPERATURE = {
  /** Triage/classification tasks — deterministic structured extraction. */
  triage: 0.1,
  /** Analytical reasoning — consistent algorithmic analysis. */
  analysis: 0.1,
  /** Code patch generation — maximum precision for exact-match search blocks. */
  patch: 0.0,
  /** Test plan generation — allow modest diversity in test-case synthesis. */
  creative: 0.2,
} as const;

const DEFAULT_DETECT_HINT = 'detect';

/**
 * Thinking budget (tokens) for Flash triage tools (impact, summary, API-breaking).
 * Explicitly disabled (0) — these are classification/extraction tasks that do not
 * benefit from a reasoning chain. Avoids default dynamic-thinking overhead.
 * Flash 2.5 range: 0–24_576.
 */
export const FLASH_TRIAGE_THINKING_BUDGET = THINKING_BUDGET_TOKENS.flashTriage;

/** Thinking budget (tokens) for Flash analysis tasks (test plans, complexity). */
export const FLASH_THINKING_BUDGET = THINKING_BUDGET_TOKENS.flash;

/** Thinking budget (tokens) for Pro model deep-analysis tasks (quality, patches). */
export const PRO_THINKING_BUDGET = THINKING_BUDGET_TOKENS.pro;

/** Output cap for Flash triage tools (impact, summary). */
export const FLASH_TRIAGE_MAX_OUTPUT_TOKENS = OUTPUT_TOKEN_BUDGET.flashTriage;

/** Output cap for API breaking-change detection (migration guidance needs room). */
export const FLASH_API_BREAKING_MAX_OUTPUT_TOKENS =
  OUTPUT_TOKEN_BUDGET.flashApiBreaking;

/** Output cap for test-plan generation (includes pseudocode snippets). */
export const FLASH_TEST_PLAN_MAX_OUTPUT_TOKENS =
  OUTPUT_TOKEN_BUDGET.flashTestPlan;

/** Output cap for Pro deep review findings. */
export const PRO_REVIEW_MAX_OUTPUT_TOKENS = OUTPUT_TOKEN_BUDGET.proReview;

/** Output cap for Pro search/replace remediation blocks. */
export const PRO_PATCH_MAX_OUTPUT_TOKENS = OUTPUT_TOKEN_BUDGET.proPatch;

/** Output cap for Flash complexity analysis reports. */
export const FLASH_COMPLEXITY_MAX_OUTPUT_TOKENS =
  OUTPUT_TOKEN_BUDGET.flashComplexity;

/** Extended timeout for Pro model calls (ms). Pro thinks longer than Flash. */
export const DEFAULT_TIMEOUT_PRO_MS = 120_000;

// ---------------------------------------------------------------------------
// Temperature presets — see TOOL_TEMPERATURE constant for rationale.
// ---------------------------------------------------------------------------

/** Temperature for triage/classification tools (deterministic structured extraction). */
export const TRIAGE_TEMPERATURE = TOOL_TEMPERATURE.triage;

/** Temperature for analytical tools (consistent algorithmic reasoning). */
export const ANALYSIS_TEMPERATURE = TOOL_TEMPERATURE.analysis;

/** Temperature for code patch generation (maximum precision for search blocks). */
export const PATCH_TEMPERATURE = TOOL_TEMPERATURE.patch;

/** Temperature for creative synthesis tools (test plan generation). */
export const CREATIVE_TEMPERATURE = TOOL_TEMPERATURE.creative;

export const MODEL_TIMEOUT_MS = {
  defaultPro: DEFAULT_TIMEOUT_PRO_MS,
} as const;

Object.freeze(MODEL_TIMEOUT_MS);

/** Default language hint when not specified by the user. Tells the model to auto-detect. */
export const DEFAULT_LANGUAGE = DEFAULT_DETECT_HINT;

/** Default test-framework hint when not specified by the user. Tells the model to auto-detect. */
export const DEFAULT_FRAMEWORK = DEFAULT_DETECT_HINT;
