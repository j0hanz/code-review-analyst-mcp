import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { computeDiffStatsAndSummaryFromFiles } from '../lib/diff.js';
import { formatOptionalLines } from '../lib/format.js';
import { getDiffContextSnapshot } from '../lib/tools.js';
import {
  buildStructuredToolExecutionOptions,
  registerStructuredToolTask,
  requireToolContract,
} from '../lib/tools.js';
import { InspectCodeQualityInputSchema } from '../schemas/inputs.js';
import {
  CodeQualityOutputSchema,
  CodeQualityResultSchema,
} from '../schemas/outputs.js';

const DEFAULT_FOCUS_AREAS = 'General';
const SYSTEM_INSTRUCTION = `
<role>
Principal Engineer.
You are an expert in code quality, security, and performance.
</role>

<task>
Perform a deep code review of the provided diff:
- Identify bugs, security vulnerabilities, and performance issues.
- Assess maintainability and clarity.
- Provide contextual insights if full file content is available.
</task>

<constraints>
- Ignore style/formatting/whitespace changes.
- Prioritize correctness and failure modes over opinionated patterns.
- Findings must be actionable and specific to the diff.
- Return valid JSON matching the schema.
</constraints>
`;
const TOOL_CONTRACT = requireToolContract('inspect_code_quality');

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
    ...buildStructuredToolExecutionOptions(TOOL_CONTRACT),
    requiresDiff: true,
    progressContext: (input) => {
      const focus = input.focusAreas
        ? `[${input.focusAreas.join(',')}]`
        : 'general';
      return `${input.repository} ${focus}`;
    },
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
      const { diff, parsedFiles } = getDiffContextSnapshot(ctx);
      const { summary: fileSummary } =
        computeDiffStatsAndSummaryFromFiles(parsedFiles);
      const optionalLines = formatOptionalLines([
        { label: 'Language', value: input.language },
        { label: 'Max Findings', value: input.maxFindings },
      ]);

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `
Repository: ${input.repository}${optionalLines}
Focus Areas: ${input.focusAreas?.join(', ') ?? DEFAULT_FOCUS_AREAS}
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
