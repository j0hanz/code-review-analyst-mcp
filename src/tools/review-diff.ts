import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  type PromptParts,
  registerStructuredToolTask,
} from '../lib/tool-factory.js';
import { ReviewDiffInputSchema } from '../schemas/inputs.js';
import { ReviewDiffResultSchema } from '../schemas/outputs.js';

const DEFAULT_MAX_FINDINGS = 10;
const DEFAULT_FOCUS_AREAS = 'security, correctness, regressions, performance';

interface ReviewPromptInput {
  repository: string;
  language?: string;
  focusAreas?: string[];
  maxFindings?: number;
  diff: string;
}

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
  registerStructuredToolTask(server, {
    name: 'review_diff',
    title: 'Review Diff',
    description:
      'Analyze a code diff and return structured findings, risk level, and test recommendations.',
    inputSchema: ReviewDiffInputSchema.shape,
    resultSchema: ReviewDiffResultSchema,
    errorCode: 'E_REVIEW_DIFF',
    buildPrompt: (input) =>
      buildReviewPrompt(input as unknown as ReviewPromptInput),
  });
}
