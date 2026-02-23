import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { computeDiffStatsAndSummaryFromFiles } from '../lib/diff-parser.js';
import {
  buildStructuredToolRuntimeOptions,
  requireToolContract,
} from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { AnalyzePrImpactInputSchema } from '../schemas/inputs.js';
import { PrImpactResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
Technical Change Analyst.
Analyze diff for objective impact: severity, categories, breaking changes, affected areas, rollback complexity.
Strictly diff-based; no inference.
Return strict JSON.
`;
const TOOL_CONTRACT = requireToolContract('analyze_pr_impact');

function formatLanguageSegment(language: string | undefined): string {
  return language ? `\nLanguage: ${language}` : '';
}

export function registerAnalyzePrImpactTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'analyze_pr_impact',
    title: 'Analyze PR Impact',
    description:
      'Assess impact and risk from cached diff. Prerequisite: generate_diff. Auto-infer repo/language.',
    inputSchema: AnalyzePrImpactInputSchema,
    fullInputSchema: AnalyzePrImpactInputSchema,
    resultSchema: PrImpactResultSchema,
    errorCode: 'E_ANALYZE_IMPACT',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    ...buildStructuredToolRuntimeOptions(TOOL_CONTRACT),
    requiresDiff: true,
    formatOutcome: (result) => `severity: ${result.severity}`,
    formatOutput: (result) =>
      `Impact Analysis (${result.severity}): ${result.summary}`,
    buildPrompt: (input, ctx) => {
      const diff = ctx.diffSlot?.diff ?? '';
      const files = ctx.diffSlot?.parsedFiles ?? [];
      const { stats, summary: fileSummary } =
        computeDiffStatsAndSummaryFromFiles(files);
      const languageSegment = formatLanguageSegment(input.language);

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `
Repository: ${input.repository}${languageSegment}
Change Stats: ${stats.files} files, +${stats.added} lines, -${stats.deleted} lines.
Changed Files:
${fileSummary}

Diff:
${diff}

Based on the diff and change stats above, analyze the PR impact.
`,
      };
    },
  });
}
