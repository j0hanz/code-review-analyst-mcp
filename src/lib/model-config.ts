/** Fast, cost-effective model for summarization and light analysis. */
export const FLASH_MODEL = 'gemini-3-flash-preview';

/** Default language hint. */
export const DEFAULT_LANGUAGE = 'detect';

/** Default test-framework hint. */
export const DEFAULT_FRAMEWORK = 'detect';

/** Extended timeout for deep analysis calls (ms). */
export const DEFAULT_TIMEOUT_EXTENDED_MS = 120_000;

export const MODEL_TIMEOUT_MS = Object.freeze({
  extended: DEFAULT_TIMEOUT_EXTENDED_MS,
} as const);

// ---------------------------------------------------------------------------
// Budgets (Thinking & Output)
// ---------------------------------------------------------------------------

const THINKING_LEVELS = {
  /** Minimal thinking for triage/classification. */
  flashTriage: 'minimal',
  /** Medium thinking for analysis tasks. */
  flash: 'medium',
  /** High thinking for deep review and patches. */
  flashHigh: 'high',
} as const;

/** Thinking level for Flash triage. */
export const FLASH_TRIAGE_THINKING_LEVEL = THINKING_LEVELS.flashTriage;

/** Thinking level for Flash analysis. */
export const FLASH_THINKING_LEVEL = THINKING_LEVELS.flash;

/** Thinking level for Flash deep analysis. */
export const FLASH_HIGH_THINKING_LEVEL = THINKING_LEVELS.flashHigh;

// Output token caps for various tools. Set to a high default to avoid cutting off important information, but can be adjusted as needed.
const DEFAULT_OUTPUT_CAP = 65_536;

/** Output cap for Flash API breaking-change detection. */
export const FLASH_API_BREAKING_MAX_OUTPUT_TOKENS = DEFAULT_OUTPUT_CAP;

/** Output cap for Flash complexity analysis. */
export const FLASH_COMPLEXITY_MAX_OUTPUT_TOKENS = DEFAULT_OUTPUT_CAP;

/** Output cap for Flash test-plan generation. */
export const FLASH_TEST_PLAN_MAX_OUTPUT_TOKENS = DEFAULT_OUTPUT_CAP;

/** Output cap for Flash triage tools. */
export const FLASH_TRIAGE_MAX_OUTPUT_TOKENS = DEFAULT_OUTPUT_CAP;

/** Output cap for Flash patch generation. */
export const FLASH_PATCH_MAX_OUTPUT_TOKENS = DEFAULT_OUTPUT_CAP;

/** Output cap for Flash deep review findings. */
export const FLASH_REVIEW_MAX_OUTPUT_TOKENS = DEFAULT_OUTPUT_CAP;

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
