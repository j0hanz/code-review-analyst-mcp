import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  computeDiffStatsAndSummaryFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { FLASH_MODEL } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { AnalyzePrImpactInputSchema } from '../schemas/inputs.js';
import { PrImpactResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are a technical change analyst. Analyze the diff for objective, evidence-based impact assessment.
Classify severity, categories, breaking changes, affected areas, and rollback complexity strictly from diff evidence.
Never infer behavior not visible in the diff.
Return strict JSON only.
`;

function formatLanguageSegment(language: string | undefined): string {
  return language ? `\nLanguage: ${language}` : '';
}

function buildAnalyzePrImpactPrompt(input: {
  repository: string;
  language?: string | undefined;
  diff: string;
}): string {
  const files = parseDiffFiles(input.diff);
  const { stats, summary: fileSummary } =
    computeDiffStatsAndSummaryFromFiles(files);
  const languageSegment = formatLanguageSegment(input.language);

  return `
Repository: ${input.repository}${languageSegment}
Change Stats: ${stats.files} files, +${stats.added} lines, -${stats.deleted} lines.
Changed Files:
${fileSummary}

Diff:
${input.diff}
`;
}

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
    formatOutput: (result) =>
      `Impact Analysis (${result.severity}): ${result.summary}`,
    buildPrompt: (input) => ({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildAnalyzePrImpactPrompt(input),
    }),
  });
}
