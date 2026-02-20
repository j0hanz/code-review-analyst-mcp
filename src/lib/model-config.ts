/** Fast, cost-effective model for summarization and light analysis. */
export const FLASH_MODEL = 'gemini-2.5-flash';

/** High-capability model for deep reasoning, quality inspection, and reliable code generation. */
export const PRO_MODEL = 'gemini-2.5-pro';

const FLASH_THINKING_BUDGET_VALUE = 8_192;
const PRO_THINKING_BUDGET_VALUE = 16_384;

/** Thinking budget (tokens) for Flash model thinking tasks (test plans, search/replace). */
export const FLASH_THINKING_BUDGET = FLASH_THINKING_BUDGET_VALUE;

/** Thinking budget (tokens) for Pro model deep-analysis tasks (code quality inspection). */
export const PRO_THINKING_BUDGET = PRO_THINKING_BUDGET_VALUE;

/** Extended timeout for Pro model calls (ms). Pro thinks longer than Flash. */
export const DEFAULT_TIMEOUT_PRO_MS = 120_000;

export const MODEL_TIMEOUT_MS = {
  defaultPro: DEFAULT_TIMEOUT_PRO_MS,
} as const;

/** Default language hint when not specified by the user. Tells the model to auto-detect. */
export const DEFAULT_LANGUAGE = 'detect';

/** Default test-framework hint when not specified by the user. Tells the model to auto-detect. */
export const DEFAULT_FRAMEWORK = 'detect';
