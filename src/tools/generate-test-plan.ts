import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  computeDiffStatsAndPathsFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { FLASH_MODEL, FLASH_THINKING_BUDGET } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { GenerateTestPlanInputSchema } from '../schemas/inputs.js';
import { TestPlanResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are a QA automation architect. Generate an actionable test plan for the diff changes.
Prioritize: negative cases, edge cases, logical branches, integration points.
Every test case must target a specific behavior visible in the diff.
Return strict JSON only.
`;

export function registerGenerateTestPlanTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'generate_test_plan',
    title: 'Generate Test Plan',
    description: 'Create a test plan covering the changes in the diff.',
    inputSchema: GenerateTestPlanInputSchema,
    fullInputSchema: GenerateTestPlanInputSchema,
    resultSchema: TestPlanResultSchema,
    errorCode: 'E_GENERATE_TEST_PLAN',
    model: FLASH_MODEL,
    thinkingBudget: FLASH_THINKING_BUDGET,
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
    buildPrompt: (input) => {
      const parsedFiles = parseDiffFiles(input.diff);
      const insights = computeDiffStatsAndPathsFromFiles(parsedFiles);
      const { stats, paths } = insights;
      const lang = input.language ? `\nLanguage: ${input.language}` : '';
      const fw = input.testFramework
        ? `\nTest Framework: ${input.testFramework}`
        : '';
      const maxT = input.maxTestCases
        ? `\nMax Test Cases: ${input.maxTestCases}`
        : '';
      const prompt = `
Repository: ${input.repository}${lang}${fw}${maxT}
Stats: ${stats.files} files, +${stats.added}, -${stats.deleted}
Changed Files: ${paths.join(', ')}

Diff:
${input.diff}
`;
      return { systemInstruction: SYSTEM_INSTRUCTION, prompt };
    },
  });
}
