import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { computeDiffStatsAndSummaryFromFiles } from '../lib/diff-parser.js';
import {
  buildStructuredToolRuntimeOptions,
  requireToolContract,
} from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { InspectCodeQualityInputSchema } from '../schemas/inputs.js';
import {
  CodeQualityOutputSchema,
  CodeQualityResultSchema,
} from '../schemas/outputs.js';

const DEFAULT_FOCUS_AREAS = 'General';
const SYSTEM_INSTRUCTION = `
Principal Engineer Code Review.
Source: Unified diff.
Goal: Identify bugs, security, performance, maintainability.
Constraint: Ignore style/formatting. Prioritize correctness/failure modes.
Return strict JSON.
`;
const TOOL_CONTRACT = requireToolContract('inspect_code_quality');

function formatOptionalLine(
  label: string,
  value: string | number | undefined
): string {
  return value === undefined ? '' : `\n${label}: ${value}`;
}

function capFindings<T>(findings: readonly T[], maxFindings?: number): T[] {
  return findings.slice(0, maxFindings ?? findings.length);
}

export function registerInspectCodeQualityTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'inspect_code_quality',
    title: 'Inspect Code Quality',
    description:
      'Deep code review. Prerequisite: generate_diff. Auto-infer repo/language/focus. Operates on the cached diff.',

    inputSchema: InspectCodeQualityInputSchema,
    fullInputSchema: InspectCodeQualityInputSchema,
    resultSchema: CodeQualityOutputSchema,
    geminiSchema: CodeQualityResultSchema,
    errorCode: 'E_INSPECT_QUALITY',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    ...buildStructuredToolRuntimeOptions(TOOL_CONTRACT),
    requiresDiff: true,
    formatOutcome: (result) =>
      `${result.findings.length} findings, risk: ${result.overallRisk}`,
    formatOutput: (result) => {
      const count = result.findings.length;
      const total = result.totalFindings ?? count;
      const findingsSuffix =
        count < total ? `${count} of ${total} findings.` : `${count} findings.`;
      return `${result.summary}\n${findingsSuffix}`;
    },
    transformResult: (input, result) => {
      const totalFindings = result.findings.length;
      const cappedFindings = capFindings(result.findings, input.maxFindings);
      return { ...result, findings: cappedFindings, totalFindings };
    },
    buildPrompt: (input, ctx) => {
      const diff = ctx.diffSlot?.diff ?? '';
      const parsedFiles = ctx.diffSlot?.parsedFiles ?? [];
      const { summary: fileSummary } =
        computeDiffStatsAndSummaryFromFiles(parsedFiles);
      const languageLine = formatOptionalLine('Language', input.language);
      const maxFindingsLine = formatOptionalLine(
        'Max Findings',
        input.maxFindings
      );

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `
Repository: ${input.repository}${languageLine}
Focus Areas: ${input.focusAreas?.join(', ') ?? DEFAULT_FOCUS_AREAS}${maxFindingsLine}
Changed Files:
${fileSummary}

Diff:
${diff}

Based on the diff above, perform a deep code review focusing on the specified areas.
`,
      };
    },
  });
}
