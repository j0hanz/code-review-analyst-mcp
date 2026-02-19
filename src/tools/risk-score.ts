import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  type PromptParts,
  registerStructuredToolTask,
} from '../lib/tool-factory.js';
import { RiskScoreInputSchema } from '../schemas/inputs.js';
import { RiskScoreResultSchema } from '../schemas/outputs.js';

const DEFAULT_DEPLOYMENT_CRITICALITY = 'medium';
// Hoisted: avoids array allocation + join on every request.
const SYSTEM_INSTRUCTION =
  'You are assessing software deployment risk from a code diff.\nReturn strict JSON only, no markdown fences.';

type RiskPromptInput = z.infer<typeof RiskScoreInputSchema>;

function joinPromptLines(lines: readonly string[]): string {
  return lines.join('\n');
}

function buildRiskPrompt(input: RiskPromptInput): PromptParts {
  const prompt = joinPromptLines([
    `Deployment criticality: ${input.deploymentCriticality ?? DEFAULT_DEPLOYMENT_CRITICALITY}`,
    'Score guidance: 0 is no risk, 100 is severe risk.',
    'Rationale must be concise, concrete, and evidence-based.',
    '',
    'Unified diff:',
    input.diff,
  ]);

  return { systemInstruction: SYSTEM_INSTRUCTION, prompt };
}

export function formatRiskOutput(result: unknown): string {
  const r = result as z.infer<typeof RiskScoreResultSchema>;
  return `Risk Score: ${r.score}/100 (${r.bucket.toUpperCase()}).`;
}

export function registerRiskScoreTool(server: McpServer): void {
  registerStructuredToolTask<RiskPromptInput>(server, {
    name: 'risk_score',
    title: 'Risk Score',
    description:
      'Score a diff from 0-100 and explain the key risk drivers for release decisions.',
    inputSchema: RiskScoreInputSchema.shape,
    fullInputSchema: RiskScoreInputSchema,
    resultSchema: RiskScoreResultSchema,
    validateInput: (input) => validateDiffBudget(input.diff),
    errorCode: 'E_RISK_SCORE',
    buildPrompt: buildRiskPrompt,
    formatOutput: formatRiskOutput,
  });
}
