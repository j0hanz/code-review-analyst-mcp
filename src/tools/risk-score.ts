import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { zodToJsonSchema } from 'zod-to-json-schema';

import { exceedsDiffBudget, getDiffBudgetError } from '../lib/diff-budget.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { generateStructuredJson } from '../lib/gemini.js';
import { createToolResponse } from '../lib/tool-response.js';
import { RiskScoreInputSchema } from '../schemas/inputs.js';
import {
  DefaultOutputSchema,
  RiskScoreResultSchema,
} from '../schemas/outputs.js';

const DEFAULT_DEPLOYMENT_CRITICALITY = 'medium';

interface RiskPromptInput {
  diff: string;
  deploymentCriticality?: 'low' | 'medium' | 'high';
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

export function buildRiskPrompt(input: RiskPromptInput): {
  systemInstruction: string;
  prompt: string;
} {
  const systemInstruction = [
    'You are assessing software deployment risk from a code diff.',
    'Return strict JSON only, no markdown fences.',
  ].join('\n');

  const prompt = [
    `Deployment criticality: ${input.deploymentCriticality ?? DEFAULT_DEPLOYMENT_CRITICALITY}`,
    'Score guidance: 0 is no risk, 100 is severe risk.',
    'Rationale must be concise, concrete, and evidence-based.',
    '',
    'Unified diff:',
    input.diff,
  ].join('\n');

  return { systemInstruction, prompt };
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
        const budgetError = getDiffBudgetErrorResponse(input.diff);
        if (budgetError) {
          return budgetError;
        }

        const { systemInstruction, prompt } = buildRiskPrompt({
          diff: input.diff,
          ...(input.deploymentCriticality
            ? { deploymentCriticality: input.deploymentCriticality }
            : {}),
        });

        const responseSchema = zodToJsonSchema(RiskScoreResultSchema) as Record<
          string,
          unknown
        >;

        const raw = await generateStructuredJson({
          systemInstruction,
          prompt,
          responseSchema,
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
