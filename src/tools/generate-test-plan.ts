import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  computeDiffStatsAndPathsFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { requireToolContract } from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { GenerateTestPlanInputSchema } from '../schemas/inputs.js';
import { TestPlanResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are a QA automation architect. Generate an actionable test plan for the diff changes.
Prioritize: negative cases, edge cases, logical branches, integration points.
Every test case must target a specific behavior visible in the diff.
Return strict JSON only.
`;
const TOOL_CONTRACT = requireToolContract('generate_test_plan');

function formatOptionalLine(
  label: string,
  value: string | number | undefined
): string {
  return value === undefined ? '' : `\n${label}: ${value}`;
}

function buildGenerateTestPlanPrompt(input: {
  repository: string;
  language?: string | undefined;
  testFramework?: string | undefined;
  maxTestCases?: number | undefined;
  diff: string;
}): string {
  const parsedFiles = parseDiffFiles(input.diff);
  const { stats, paths } = computeDiffStatsAndPathsFromFiles(parsedFiles);
  const languageLine = formatOptionalLine('Language', input.language);
  const frameworkLine = formatOptionalLine(
    'Test Framework',
    input.testFramework
  );
  const maxCasesLine = formatOptionalLine('Max Test Cases', input.maxTestCases);

  return `
Repository: ${input.repository}${languageLine}${frameworkLine}${maxCasesLine}
Stats: ${stats.files} files, +${stats.added}, -${stats.deleted}
Changed Files: ${paths.join(', ')}

Diff:
${input.diff}
`;
}

export function registerGenerateTestPlanTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'generate_test_plan',
    title: 'Generate Test Plan',
    description: 'Create a test plan covering the changes in the diff.',
    inputSchema: GenerateTestPlanInputSchema,
    fullInputSchema: GenerateTestPlanInputSchema,
    resultSchema: TestPlanResultSchema,
    errorCode: 'E_GENERATE_TEST_PLAN',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    ...(TOOL_CONTRACT.thinkingBudget !== undefined
      ? { thinkingBudget: TOOL_CONTRACT.thinkingBudget }
      : undefined),
    validateInput: (input) => validateDiffBudget(input.diff),
    formatOutcome: (result) => `${result.testCases.length} test cases`,
    formatOutput: (result) =>
      `Test Plan: ${result.summary}\n${result.testCases.length} cases proposed.`,
    transformResult: (input, result) => {
      const cappedTestCases = result.testCases.slice(
        0,
        input.maxTestCases ?? result.testCases.length
      );

      return {
        ...result,
        testCases: cappedTestCases,
      };
    },
    buildPrompt: (input) => ({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildGenerateTestPlanPrompt(input),
    }),
  });
}
