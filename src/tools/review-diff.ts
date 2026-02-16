import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { exceedsDiffBudget, getDiffBudgetError } from '../lib/diff-budget.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { generateStructuredJson } from '../lib/gemini.js';
import { createToolResponse } from '../lib/tool-response.js';
import { ReviewDiffInputSchema } from '../schemas/inputs.js';
import {
  DefaultOutputSchema,
  ReviewDiffResultSchema,
} from '../schemas/outputs.js';

function getReviewSchema(maxFindings: number): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      overallRisk: { type: 'string', enum: ['low', 'medium', 'high'] },
      findings: {
        type: 'array',
        maxItems: maxFindings,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            file: { type: 'string' },
            line: { type: ['integer', 'null'] },
            title: { type: 'string' },
            explanation: { type: 'string' },
            recommendation: { type: 'string' },
          },
          required: [
            'severity',
            'file',
            'line',
            'title',
            'explanation',
            'recommendation',
          ],
        },
      },
      testsNeeded: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['summary', 'overallRisk', 'findings', 'testsNeeded'],
  };
}

export function buildReviewPrompt(input: {
  repository: string;
  language?: string;
  focusAreas?: string[];
  maxFindings: number;
  diff: string;
}): string {
  const focus = input.focusAreas?.length
    ? input.focusAreas.join(', ')
    : 'security, correctness, regressions, performance';

  return [
    'You are a senior staff engineer performing pull request review.',
    'Return strict JSON only with no markdown fences.',
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
        if (exceedsDiffBudget(input.diff)) {
          return createErrorResponse(
            'E_INPUT_TOO_LARGE',
            getDiffBudgetError(input.diff.length)
          );
        }

        const maxFindings = input.maxFindings ?? 10;
        const prompt = buildReviewPrompt({
          repository: input.repository,
          ...(input.language ? { language: input.language } : {}),
          ...(input.focusAreas ? { focusAreas: input.focusAreas } : {}),
          maxFindings,
          diff: input.diff,
        });

        const raw = await generateStructuredJson({
          prompt,
          responseSchema: getReviewSchema(maxFindings),
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
