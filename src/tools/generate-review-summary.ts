import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import {
  buildStructuredToolRuntimeOptions,
  requireToolContract,
} from '../lib/tool-contracts.js';
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
Senior Code Reviewer.
Summarize PR: risk, key changes, merge recommendation (merge/squash/block).
Specific logic changes only.
Return strict JSON.
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
    ...buildStructuredToolRuntimeOptions(TOOL_CONTRACT),
    requiresDiff: true,
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
