/** Fast, cost-effective model for summarization and light analysis. */
export const FLASH_MODEL = 'gemini-2.5-flash';

/** High-capability model for deep reasoning, quality inspection, and reliable code generation. */
export const PRO_MODEL = 'gemini-2.5-pro';

const THINKING_BUDGET_TOKENS = {
  flash: 8_192,
  pro: 16_384,
} as const;

const OUTPUT_TOKEN_BUDGET = {
  flashTriage: 4_096,
  flashTestPlan: 4_096,
  flashApiBreaking: 4_096,
  flashComplexity: 2_048,
  proReview: 8_192,
  proPatch: 4_096,
} as const;
const DEFAULT_DETECT_HINT = 'detect';

/** Thinking budget (tokens) for Flash model thinking tasks (test plans, search/replace). */
export const FLASH_THINKING_BUDGET = THINKING_BUDGET_TOKENS.flash;

/** Thinking budget (tokens) for Pro model deep-analysis tasks (code quality inspection). */
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

export const MODEL_TIMEOUT_MS = {
  defaultPro: DEFAULT_TIMEOUT_PRO_MS,
} as const;

Object.freeze(MODEL_TIMEOUT_MS);

/** Default language hint when not specified by the user. Tells the model to auto-detect. */
export const DEFAULT_LANGUAGE = DEFAULT_DETECT_HINT;

/** Default test-framework hint when not specified by the user. Tells the model to auto-detect. */
export const DEFAULT_FRAMEWORK = DEFAULT_DETECT_HINT;
