import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { generateStructuredJson } from '../lib/gemini.js';
import { createToolResponse } from '../lib/tool-response.js';
import { RiskScoreInputSchema } from '../schemas/inputs.js';
import {
  DefaultOutputSchema,
  RiskScoreResultSchema,
} from '../schemas/outputs.js';

const RiskScoreJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    bucket: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    rationale: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['score', 'bucket', 'rationale'],
};

function buildRiskPrompt(input: {
  diff: string;
  deploymentCriticality?: 'low' | 'medium' | 'high';
}): string {
  return [
    'You are assessing software deployment risk from a code diff.',
    'Return strict JSON only, no markdown fences.',
    `Deployment criticality: ${input.deploymentCriticality ?? 'medium'}`,
    'Score guidance: 0 is no risk, 100 is severe risk.',
    'Rationale must be concise, concrete, and evidence-based.',
    '',
    'Unified diff:',
    input.diff,
  ].join('\n');
}

export function registerRiskScoreTool(server: McpServer): void {
  server.registerTool(
    'risk_score',
    {
      title: 'Risk Score',
      description:
        'Score a diff from 0-100 and explain the key risk drivers for release decisions.',
      inputSchema: RiskScoreInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const raw = await generateStructuredJson({
          prompt: buildRiskPrompt({
            diff: input.diff,
            ...(input.deploymentCriticality
              ? { deploymentCriticality: input.deploymentCriticality }
              : {}),
          }),
          responseSchema: RiskScoreJsonSchema,
        });
        const parsed = RiskScoreResultSchema.parse(raw);

        return createToolResponse({
          ok: true,
          result: parsed,
        });
      } catch (error: unknown) {
        return createErrorResponse('E_RISK_SCORE', getErrorMessage(error));
      }
    }
  );
}
