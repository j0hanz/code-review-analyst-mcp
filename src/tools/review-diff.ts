import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { zodToJsonSchema } from 'zod-to-json-schema';

import { exceedsDiffBudget, getDiffBudgetError } from '../lib/diff-budget.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { generateStructuredJson } from '../lib/gemini.js';
import { createToolResponse } from '../lib/tool-response.js';
import { ReviewDiffInputSchema } from '../schemas/inputs.js';
import {
  DefaultOutputSchema,
  ReviewDiffResultSchema,
} from '../schemas/outputs.js';

const DEFAULT_MAX_FINDINGS = 10;
const DEFAULT_FOCUS_AREAS = 'security, correctness, regressions, performance';

interface ReviewPromptInput {
  repository: string;
  language?: string;
  focusAreas?: string[];
  maxFindings: number;
  diff: string;
}

function getDiffBudgetErrorResponse(
  diff: string
): ReturnType<typeof createErrorResponse> | undefined {
  if (!exceedsDiffBudget(diff)) {
    return undefined;
  }

  return createErrorResponse(
    'E_INPUT_TOO_LARGE',
    getDiffBudgetError(diff.length)
  );
}

export function buildReviewPrompt(input: ReviewPromptInput): {
  systemInstruction: string;
  prompt: string;
} {
  const focus = input.focusAreas?.length
    ? input.focusAreas.join(', ')
    : DEFAULT_FOCUS_AREAS;

  const systemInstruction = [
    'You are a senior staff engineer performing pull request review.',
    'Return strict JSON only with no markdown fences.',
  ].join('\n');

  const prompt = [
    `Repository: ${input.repository}`,
    `Primary language: ${input.language ?? 'not specified'}`,
    `Focus areas: ${focus}`,
    `Limit findings to ${input.maxFindings}.`,
    'Prioritize concrete, high-confidence defects and risky behavior changes.',
    'Include testsNeeded as short action items.',
    '',
    'Unified diff:',
    input.diff,
  ].join('\n');

  return { systemInstruction, prompt };
}

export function registerReviewDiffTool(server: McpServer): void {
  server.registerTool(
    'review_diff',
    {
      title: 'Review Diff',
      description:
        'Analyze a code diff and return structured findings, risk level, and test recommendations.',
      inputSchema: ReviewDiffInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const budgetError = getDiffBudgetErrorResponse(input.diff);
        if (budgetError) {
          return budgetError;
        }

        const maxFindings = input.maxFindings ?? DEFAULT_MAX_FINDINGS;
        const { systemInstruction, prompt } = buildReviewPrompt({
          repository: input.repository,
          ...(input.language ? { language: input.language } : {}),
          ...(input.focusAreas ? { focusAreas: input.focusAreas } : {}),
          maxFindings,
          diff: input.diff,
        });

        const responseSchema = zodToJsonSchema(
          ReviewDiffResultSchema
        ) as Record<string, unknown>;

        const raw = await generateStructuredJson({
          systemInstruction,
          prompt,
          responseSchema,
        });
        const parsed = ReviewDiffResultSchema.parse(raw);

        return createToolResponse({
          ok: true,
          result: parsed,
        });
      } catch (error: unknown) {
        return createErrorResponse('E_REVIEW_DIFF', getErrorMessage(error));
      }
    }
  );
}
