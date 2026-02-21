import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  computeDiffStatsFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { createNoDiffError, getDiff } from '../lib/diff-store.js';
import { requireToolContract } from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { GenerateReviewSummaryInputSchema } from '../schemas/inputs.js';
import { ReviewSummaryResultSchema } from '../schemas/outputs.js';

const ReviewSummaryModelSchema = ReviewSummaryResultSchema.omit({
  stats: true,
});
const TOOL_CONTRACT = requireToolContract('generate_review_summary');
const SYSTEM_INSTRUCTION = `
You are a senior code reviewer. Summarize this PR with precision: risk level, key changes, and a definitive merge recommendation (merge, squash, or block).
Be specific — name the exact logic changed, not generic patterns.
Return strict JSON only.
`;
type ReviewSummaryInput = z.infer<typeof GenerateReviewSummaryInputSchema>;

function formatLanguageSegment(language: string | undefined): string {
  return language ? `\nLanguage: ${language}` : '';
}

export function registerGenerateReviewSummaryTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'generate_review_summary',
    title: 'Generate Review Summary',
    description:
      'Summarize the cached diff and assess high-level risk. Call generate_diff first.',
    inputSchema: GenerateReviewSummaryInputSchema,
    fullInputSchema: GenerateReviewSummaryInputSchema,
    resultSchema: ReviewSummaryModelSchema,
    errorCode: 'E_REVIEW_SUMMARY',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    validateInput: () => {
      const slot = getDiff();
      if (!slot) return createNoDiffError();
      return validateDiffBudget(slot.diff);
    },
    formatOutcome: (result) => `risk: ${result.overallRisk}`,
    transformResult: (input: ReviewSummaryInput, result) => {
      const slot = getDiff();
      const diff = slot?.diff ?? '';
      const parsedFiles = parseDiffFiles(diff);
      const stats = computeDiffStatsFromFiles(parsedFiles);

      return {
        ...result,
        stats: {
          filesChanged: stats.files,
          linesAdded: stats.added,
          linesRemoved: stats.deleted,
        },
      };
    },
    formatOutput: (result) =>
      `Review Summary: ${result.summary}\nRecommendation: ${result.recommendation}`,
    buildPrompt: (input: ReviewSummaryInput) => {
      const slot = getDiff();
      const diff = slot?.diff ?? '';
      const parsedFiles = parseDiffFiles(diff);
      const stats = computeDiffStatsFromFiles(parsedFiles);
      const languageSegment = formatLanguageSegment(input.language);

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `
Repository: ${input.repository}${languageSegment}
Stats: ${stats.files} files, +${stats.added}, -${stats.deleted}

Diff:
${diff}
`,
      };
    },
  });
}
