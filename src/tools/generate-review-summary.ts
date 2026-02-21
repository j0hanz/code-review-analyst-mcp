import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import { createNoDiffError } from '../lib/diff-store.js';
import { requireToolContract } from '../lib/tool-contracts.js';
import {
  registerStructuredToolTask,
  type ToolExecutionContext,
} from '../lib/tool-factory.js';
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

function getDiffStats(ctx: ToolExecutionContext): {
  diff: string;
  files: number;
  added: number;
  deleted: number;
} {
  const slot = ctx.diffSlot;
  if (!slot) {
    return { diff: '', files: 0, added: 0, deleted: 0 };
  }
  return {
    diff: slot.diff,
    files: slot.stats.files,
    added: slot.stats.added,
    deleted: slot.stats.deleted,
  };
}

export function registerGenerateReviewSummaryTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'generate_review_summary',
    title: 'Generate Review Summary',
    description:
      'Summarize diff and risk level. Prerequisite: generate_diff. Auto-infer repo/language.',
    inputSchema: GenerateReviewSummaryInputSchema,
    fullInputSchema: GenerateReviewSummaryInputSchema,
    resultSchema: ReviewSummaryModelSchema,
    errorCode: 'E_REVIEW_SUMMARY',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    ...(TOOL_CONTRACT.thinkingLevel !== undefined
      ? { thinkingLevel: TOOL_CONTRACT.thinkingLevel }
      : undefined),
    ...(TOOL_CONTRACT.temperature !== undefined
      ? { temperature: TOOL_CONTRACT.temperature }
      : undefined),
    validateInput: (_input, ctx) => {
      const slot = ctx.diffSlot;
      if (!slot) return createNoDiffError();
      return validateDiffBudget(slot.diff);
    },
    formatOutcome: (result) => `risk: ${result.overallRisk}`,
    transformResult: (_input: ReviewSummaryInput, result, ctx) => {
      const { files, added, deleted } = getDiffStats(ctx);
      return {
        ...result,
        stats: {
          filesChanged: files,
          linesAdded: added,
          linesRemoved: deleted,
        },
      };
    },
    formatOutput: (result) =>
      `Review Summary: ${result.summary}\nRecommendation: ${result.recommendation}`,
    buildPrompt: (input: ReviewSummaryInput, ctx) => {
      const { diff, files, added, deleted } = getDiffStats(ctx);
      const languageSegment = formatLanguageSegment(input.language);

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `
Repository: ${input.repository}${languageSegment}
Stats: ${files} files, +${added}, -${deleted}

Diff:
${diff}

Based on the diff and stats above, summarize the PR and provide a merge recommendation.
`,
      };
    },
  });
}
