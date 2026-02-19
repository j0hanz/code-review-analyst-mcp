import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  computeDiffStatsFromFiles,
  extractChangedPathsFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { FLASH_MODEL, FLASH_THINKING_BUDGET } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { GenerateTestPlanInputSchema } from '../schemas/inputs.js';
import { TestPlanResultSchema } from '../schemas/outputs.js';

const DEFAULT_LANGUAGE = 'detect';
const DEFAULT_TEST_FRAMEWORK = 'detect';
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
    formatOutput: (result) => {
      const typed = result as z.infer<typeof TestPlanResultSchema>;
      return `Test Plan: ${typed.summary}\n${typed.testCases.length} cases proposed.`;
    },
    transformResult: (input, result) => {
      const typed = result as z.infer<typeof TestPlanResultSchema>;
      const cappedTestCases = typed.testCases.slice(
        0,
        input.maxTestCases ?? typed.testCases.length
      );

      return {
        ...typed,
        testCases: cappedTestCases,
      };
    },
    buildPrompt: (input) => {
      const parsedFiles = parseDiffFiles(input.diff);
      const stats = computeDiffStatsFromFiles(parsedFiles);
      const paths = extractChangedPathsFromFiles(parsedFiles);
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
