import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { computeDiffStatsAndPathsFromFiles } from '../lib/diff-parser.js';
import {
  buildStructuredToolRuntimeOptions,
  requireToolContract,
} from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { GenerateTestPlanInputSchema } from '../schemas/inputs.js';
import { TestPlanResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
QA Automation Architect.
Test plan for diff.
Prioritize: negative, edge, branches, integration.
Target specific visible behavior.
Return strict JSON.
`;
const TOOL_CONTRACT = requireToolContract('generate_test_plan');

function formatOptionalLine(
  label: string,
  value: string | number | undefined
): string {
  return value === undefined ? '' : `\n${label}: ${value}`;
}

export function registerGenerateTestPlanTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'generate_test_plan',
    title: 'Generate Test Plan',
    description:
      'Generate test cases. Prerequisite: generate_diff. Auto-infer repo/language/framework.',
    inputSchema: GenerateTestPlanInputSchema,
    fullInputSchema: GenerateTestPlanInputSchema,
    resultSchema: TestPlanResultSchema,
    errorCode: 'E_GENERATE_TEST_PLAN',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    ...buildStructuredToolRuntimeOptions(TOOL_CONTRACT),
    requiresDiff: true,
    formatOutcome: (result) => `${result.testCases.length} test cases`,
    formatOutput: (result) =>
      `${result.summary}\n${result.testCases.length} test cases.`,
    transformResult: (input, result) => {
      const cappedTestCases = result.testCases.slice(
        0,
        input.maxTestCases ?? result.testCases.length
      );
      return { ...result, testCases: cappedTestCases };
    },
    buildPrompt: (input, ctx) => {
      const diff = ctx.diffSlot?.diff ?? '';
      const parsedFiles = ctx.diffSlot?.parsedFiles ?? [];
      const { stats, paths } = computeDiffStatsAndPathsFromFiles(parsedFiles);
      const languageLine = formatOptionalLine('Language', input.language);
      const frameworkLine = formatOptionalLine(
        'Test Framework',
        input.testFramework
      );
      const maxCasesLine = formatOptionalLine(
        'Max Test Cases',
        input.maxTestCases
      );

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `
Repository: ${input.repository}${languageLine}${frameworkLine}${maxCasesLine}
Stats: ${stats.files} files, +${stats.added}, -${stats.deleted}
Changed Files: ${paths.join(', ')}

Diff:
${diff}

Based on the diff and stats above, generate an actionable test plan.
`,
      };
    },
  });
}
