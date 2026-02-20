import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  computeDiffStatsAndSummaryFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { DEFAULT_LANGUAGE, FLASH_MODEL } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { AnalyzePrImpactInputSchema } from '../schemas/inputs.js';
import { PrImpactResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are a rigorous technical change analyst.
Your goal is to objectively identify facts about what changed and their specific downstream effects.
Analyze the provided Unified Diff and determine its impact severity and categories based ONLY on the evidence in the code.
Strictly evaluate breaking changes, API modifications, and rollback complexity.
Do not assume behavior not visible in the diff.
Return strict JSON only.
`;

export function registerAnalyzePrImpactTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'analyze_pr_impact',
    title: 'Analyze PR Impact',
    description: 'Assess the impact and risk of a pull request diff.',
    inputSchema: AnalyzePrImpactInputSchema,
    fullInputSchema: AnalyzePrImpactInputSchema,
    resultSchema: PrImpactResultSchema,
    errorCode: 'E_ANALYZE_IMPACT',
    model: FLASH_MODEL,
    validateInput: (input) => validateDiffBudget(input.diff),
    formatOutcome: (result) => `severity: ${result.severity}`,
    formatOutput: (result) => {
      return `Impact Analysis (${result.severity}): ${result.summary}`;
    },
    buildPrompt: (input) => {
      const files = parseDiffFiles(input.diff);
      const insights = computeDiffStatsAndSummaryFromFiles(files);
      const { stats, summary: fileSummary } = insights;

      const prompt = `
Repository: ${input.repository}
Language: ${input.language ?? DEFAULT_LANGUAGE}
Change Stats: ${stats.files} files, +${stats.added} lines, -${stats.deleted} lines.
Changed Files:
${fileSummary}

Diff:
${input.diff}
`;
      return { systemInstruction: SYSTEM_INSTRUCTION, prompt };
    },
  });
}
