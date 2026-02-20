import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  computeDiffStatsFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { FLASH_MODEL } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { GenerateReviewSummaryInputSchema } from '../schemas/inputs.js';
import { ReviewSummaryResultSchema } from '../schemas/outputs.js';

const ReviewSummaryModelSchema = ReviewSummaryResultSchema.omit({
  stats: true,
});
const SYSTEM_INSTRUCTION = `
You are a senior code reviewer. Summarize this PR with precision: risk level, key changes, and a definitive merge recommendation (merge, squash, or block).
Be specific — name the exact logic changed, not generic patterns.
Return strict JSON only.
`;
type ReviewSummaryInput = z.infer<typeof GenerateReviewSummaryInputSchema>;
interface CachedStats {
  files: number;
  added: number;
  deleted: number;
}

const statsCache = new WeakMap<ReviewSummaryInput, CachedStats>();

function getCachedStats(input: ReviewSummaryInput): CachedStats {
  const cached = statsCache.get(input);
  if (cached) {
    return cached;
  }

  const parsedFiles = parseDiffFiles(input.diff);
  const stats = computeDiffStatsFromFiles(parsedFiles);
  statsCache.set(input, stats);
  return stats;
}

function formatLanguageSegment(language: string | undefined): string {
  return language ? `\nLanguage: ${language}` : '';
}

function buildReviewSummaryPrompt(input: ReviewSummaryInput): string {
  const stats = getCachedStats(input);
  const languageSegment = formatLanguageSegment(input.language);

  return `
Repository: ${input.repository}${languageSegment}
Stats: ${stats.files} files, +${stats.added}, -${stats.deleted}

Diff:
${input.diff}
`;
}

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
    formatOutcome: (result) => `risk: ${result.overallRisk}`,
    transformResult: (input, result) => {
      const stats = getCachedStats(input);
      statsCache.delete(input);

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
    buildPrompt: (input) => ({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildReviewSummaryPrompt(input),
    }),
  });
}
