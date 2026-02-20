import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  computeDiffStatsAndPathsFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_FRAMEWORK as DEFAULT_TEST_FRAMEWORK,
  FLASH_MODEL,
  FLASH_THINKING_BUDGET,
} from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { GenerateTestPlanInputSchema } from '../schemas/inputs.js';
import { TestPlanResultSchema } from '../schemas/outputs.js';

const DEFAULT_MAX_TEST_CASES = 'auto';
const SYSTEM_INSTRUCTION = `
You are a QA automation architect.
Analyze the diff and generate a comprehensive test plan.
Focus on edge cases, logical branches, and integration points affected by the changes.
Ensure test cases are actionable and verify specific behaviors.
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
    progressContext: (input) =>
      `repo: ${input.repository}, framework: ${input.testFramework ?? DEFAULT_TEST_FRAMEWORK}, max-cases: ${input.maxTestCases ?? DEFAULT_MAX_TEST_CASES}`,
    formatOutput: (result) => {
      return `Test Plan: ${result.summary}\n${result.testCases.length} cases proposed.`;
    },
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
      const prompt = `
Repository: ${input.repository}
Language: ${input.language ?? DEFAULT_LANGUAGE}
Test Framework: ${input.testFramework ?? DEFAULT_TEST_FRAMEWORK}
Max Test Cases: ${input.maxTestCases ?? DEFAULT_MAX_TEST_CASES}
Stats: ${stats.files} files, +${stats.added}, -${stats.deleted}
Changed Files: ${paths.join(', ')}

Diff:
${input.diff}
`;
      return { systemInstruction: SYSTEM_INSTRUCTION, prompt };
    },
  });
}
