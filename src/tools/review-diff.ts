import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  type PromptParts,
  registerStructuredToolTask,
} from '../lib/tool-factory.js';
import { ReviewDiffInputSchema } from '../schemas/inputs.js';
import { ReviewDiffResultSchema } from '../schemas/outputs.js';

const DEFAULT_MAX_FINDINGS = 10;
const DEFAULT_FOCUS_AREAS = 'security, correctness, regressions, performance';

type ReviewPromptInput = z.infer<typeof ReviewDiffInputSchema>;

function buildReviewPrompt(input: ReviewPromptInput): PromptParts {
  const focus = input.focusAreas?.length
    ? input.focusAreas.join(', ')
    : DEFAULT_FOCUS_AREAS;

  const maxFindings = input.maxFindings ?? DEFAULT_MAX_FINDINGS;

  const systemInstruction = [
    'You are a senior staff engineer performing pull request review.',
    'Return strict JSON only with no markdown fences.',
  ].join('\n');

  const prompt = [
    `Repository: ${input.repository}`,
    `Primary language: ${input.language ?? 'not specified'}`,
    `Focus areas: ${focus}`,
    `Limit findings to ${maxFindings}.`,
    'Prioritize concrete, high-confidence defects and risky behavior changes.',
    'Include testsNeeded as short action items.',
    '',
    'Unified diff:',
    input.diff,
  ].join('\n');

  return { systemInstruction, prompt };
}

export function registerReviewDiffTool(server: McpServer): void {
  registerStructuredToolTask<ReviewPromptInput>(server, {
    name: 'review_diff',
    title: 'Review Diff',
    description:
      'Analyze a code diff and return structured findings, risk level, and test recommendations.',
    inputSchema: ReviewDiffInputSchema.shape,
    fullInputSchema: ReviewDiffInputSchema,
    resultSchema: ReviewDiffResultSchema,
    validateInput: (input) => validateDiffBudget(input.diff),
    errorCode: 'E_REVIEW_DIFF',
    buildPrompt: buildReviewPrompt,
  });
}
