/** Fast, cost-effective model for summarization and light analysis. */
export const FLASH_MODEL = 'gemini-2.5-flash';

/** High-capability model for deep reasoning, quality inspection, and reliable code generation. */
export const PRO_MODEL = 'gemini-2.5-pro';

const MODEL_THINKING_BUDGET = {
  flash: 8_192,
  pro: 16_384,
} as const;

/** Thinking budget (tokens) for Flash model thinking tasks (test plans, search/replace). */
export const FLASH_THINKING_BUDGET = MODEL_THINKING_BUDGET.flash;

/** Thinking budget (tokens) for Pro model deep-analysis tasks (code quality inspection). */
export const PRO_THINKING_BUDGET = MODEL_THINKING_BUDGET.pro;

/** Extended timeout for Pro model calls (ms). Pro thinks longer than Flash. */
export const DEFAULT_TIMEOUT_PRO_MS = 120_000;

export const MODEL_TIMEOUT_MS = {
  defaultPro: DEFAULT_TIMEOUT_PRO_MS,
} as const;
