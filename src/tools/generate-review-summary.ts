import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { type z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import { computeDiffStats } from '../lib/diff-parser.js';
import { FLASH_MODEL } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { GenerateReviewSummaryInputSchema } from '../schemas/inputs.js';
import { ReviewSummaryResultSchema } from '../schemas/outputs.js';

const ReviewSummaryModelSchema = ReviewSummaryResultSchema.omit({
  stats: true,
});
const DEFAULT_LANGUAGE = 'detect';
const SYSTEM_INSTRUCTION = `
You are a senior code reviewer.
Summarize the changes in this pull request and provide a high-level risk assessment.
Identify key changes and provide a merge recommendation.
Return strict JSON only.
`;

export function registerGenerateReviewSummaryTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'generate_review_summary',
    title: 'Generate Review Summary',
    description: 'Summarize a pull request diff and assess high-level risk.',
    inputSchema: GenerateReviewSummaryInputSchema,
    fullInputSchema: GenerateReviewSummaryInputSchema,
    resultSchema: ReviewSummaryModelSchema,
    errorCode: 'E_REVIEW_SUMMARY',
    model: FLASH_MODEL,
    validateInput: (input) => validateDiffBudget(input.diff),
    transformResult: (input, result) => {
      const partial = result as z.infer<typeof ReviewSummaryModelSchema>;
      const stats = computeDiffStats(input.diff);

      return {
        ...partial,
        stats: {
          filesChanged: stats.files,
          linesAdded: stats.added,
          linesRemoved: stats.deleted,
        },
      };
    },
    formatOutput: (result) => {
      const typed = result as z.infer<typeof ReviewSummaryResultSchema>;
      return `Review Summary: ${typed.summary}\nRecommendation: ${typed.recommendation}`;
    },
    buildPrompt: (input) => {
      const stats = computeDiffStats(input.diff);
      const prompt = `
Repository: ${input.repository}
Language: ${input.language ?? DEFAULT_LANGUAGE}
Stats: ${stats.files} files, +${stats.added}, -${stats.deleted}

Diff:
${input.diff}
`;
      return { systemInstruction: SYSTEM_INSTRUCTION, prompt };
    },
  });
}
