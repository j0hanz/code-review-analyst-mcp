import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  type PromptParts,
  registerStructuredToolTask,
} from '../lib/tool-factory.js';
import { RiskScoreInputSchema } from '../schemas/inputs.js';
import { RiskScoreResultSchema } from '../schemas/outputs.js';

const DEFAULT_DEPLOYMENT_CRITICALITY = 'medium';

interface RiskPromptInput {
  diff: string;
  deploymentCriticality?: 'low' | 'medium' | 'high';
}

function buildRiskPrompt(input: RiskPromptInput): PromptParts {
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
  registerStructuredToolTask(server, {
    name: 'risk_score',
    title: 'Risk Score',
    description:
      'Score a diff from 0-100 and explain the key risk drivers for release decisions.',
    inputSchema: RiskScoreInputSchema.shape,
    resultSchema: RiskScoreResultSchema,
    errorCode: 'E_RISK_SCORE',
    buildPrompt: (input) =>
      buildRiskPrompt(input as unknown as RiskPromptInput),
  });
}
