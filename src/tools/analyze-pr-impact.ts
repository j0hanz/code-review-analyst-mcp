import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import { computeDiffStatsAndSummaryFromFiles } from '../lib/diff-parser.js';
import { createNoDiffError } from '../lib/diff-store.js';
import { requireToolContract } from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { AnalyzePrImpactInputSchema } from '../schemas/inputs.js';
import { PrImpactResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are a technical change analyst. Analyze the diff for objective, evidence-based impact assessment.
Classify severity, categories, breaking changes, affected areas, and rollback complexity strictly from diff evidence.
Never infer behavior not visible in the diff.
Return strict JSON only.
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
    ...(TOOL_CONTRACT.thinkingLevel !== undefined
      ? { thinkingLevel: TOOL_CONTRACT.thinkingLevel }
      : undefined),
    ...(TOOL_CONTRACT.temperature !== undefined
      ? { temperature: TOOL_CONTRACT.temperature }
      : undefined),
    ...(TOOL_CONTRACT.deterministicJson !== undefined
      ? { deterministicJson: TOOL_CONTRACT.deterministicJson }
      : undefined),
    validateInput: (_input, ctx) => {
      const slot = ctx.diffSlot;
      if (!slot) return createNoDiffError();
      return validateDiffBudget(slot.diff);
    },
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
