import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { type z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  computeDiffStats,
  formatFileSummary,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { FLASH_MODEL } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { AnalyzePrImpactInputSchema } from '../schemas/inputs.js';
import { PrImpactResultSchema } from '../schemas/outputs.js';

export function registerAnalyzePrImpactTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'analyze_pr_impact',
    title: 'Analyze PR Impact',
    description: 'Assess the impact and risk of a pull request diff.',
    inputSchema: AnalyzePrImpactInputSchema.shape,
    fullInputSchema: AnalyzePrImpactInputSchema,
    resultSchema: PrImpactResultSchema,
    errorCode: 'E_ANALYZE_IMPACT',
    model: FLASH_MODEL,
    validateInput: (input) => {
      validateDiffBudget(input.diff);
      return undefined;
    },
    formatOutput: (result) => {
      const typed = result as z.infer<typeof PrImpactResultSchema>;
      return `Impact Analysis (${typed.severity}): ${typed.summary}`;
    },
    buildPrompt: (input) => {
      const stats = computeDiffStats(input.diff);
      const files = parseDiffFiles(input.diff);
      const fileSummary = formatFileSummary(files);

      const systemInstruction = `
You are a technical change analyst.
Your goal is to identify observable facts about what changed and their downstream effects.
Analyze the provided Unified Diff and determine its impact severity and categories.
Focus on breaking changes, API modifications, and rollback complexity.
Return strict JSON only.
`;

      const prompt = `
Repository: ${input.repository}
Language: ${input.language ?? 'detect'}
Change Stats: ${stats.files} files, +${stats.added} lines, -${stats.deleted} lines.
Changed Files:
${fileSummary}

Diff:
${input.diff}
`;
      return { systemInstruction, prompt };
    },
  });
}
