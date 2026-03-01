import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

import { formatLanguageSegment } from '../lib/format.js';
import { getDiffContextSnapshot } from '../lib/tool-context.js';
import {
  buildStructuredToolExecutionOptions,
  requireToolContract,
} from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { GenerateReviewSummaryInputSchema } from '../schemas/inputs.js';
import { ReviewSummaryResultSchema } from '../schemas/outputs.js';

const ReviewSummaryModelSchema = ReviewSummaryResultSchema.omit({
  stats: true,
});
const TOOL_CONTRACT = requireToolContract('generate_review_summary');
const SYSTEM_INSTRUCTION = `
<role>
Senior Code Reviewer.
You are a pragmatic engineer focused on stability and maintainability.
</role>

<task>
Summarize the pull request based on the diff:
- Assess overall risk (low/medium/high).
- Highlight key logic/behavior changes.
- Recommend action: merge, squash, or block.
</task>

<constraints>
- Focus on logic and behavior; ignore style, formatting, and typos.
- Be concise and actionable.
- Return valid JSON matching the schema.
</constraints>
`;
type ReviewSummaryInput = z.infer<typeof GenerateReviewSummaryInputSchema>;

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
    ...buildStructuredToolExecutionOptions(TOOL_CONTRACT),
    requiresDiff: true,
    progressContext: (input) => input.repository,
    formatOutcome: (result) => `risk: ${result.overallRisk}`,
    transformResult: (_input: ReviewSummaryInput, result, ctx) => {
      const { stats } = getDiffContextSnapshot(ctx);
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
      `${result.summary}\nRecommendation: ${result.recommendation}`,
    buildPrompt: (input: ReviewSummaryInput, ctx) => {
      const { diff, stats } = getDiffContextSnapshot(ctx);
      const languageSegment = formatLanguageSegment(input.language);

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `
Repository: ${input.repository}${languageSegment}
Stats: ${stats.files} files, +${stats.added}, -${stats.deleted}

Diff:
${diff}

Based on the diff and stats above, summarize the PR and provide a merge recommendation.
`,
      };
    },
  });
}
