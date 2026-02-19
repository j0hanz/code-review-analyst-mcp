import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import { computeDiffStats, extractChangedPaths } from '../lib/diff-parser.js';
import { FLASH_MODEL, FLASH_THINKING_BUDGET } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { GenerateTestPlanInputSchema } from '../schemas/inputs.js';
import { TestPlanResultSchema } from '../schemas/outputs.js';

export function registerGenerateTestPlanTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'generate_test_plan',
    title: 'Generate Test Plan',
    description: 'Create a test plan covering the changes in the diff.',
    inputSchema: GenerateTestPlanInputSchema.shape,
    fullInputSchema: GenerateTestPlanInputSchema,
    resultSchema: TestPlanResultSchema,
    errorCode: 'E_GENERATE_TEST_PLAN',
    model: FLASH_MODEL,
    thinkingBudget: FLASH_THINKING_BUDGET,
    validateInput: (input) => {
      return validateDiffBudget(input.diff);
    },
    formatOutput: (result) => {
      const typed = result as z.infer<typeof TestPlanResultSchema>;
      return `Test Plan: ${typed.summary}\n${typed.testCases.length} cases proposed.`;
    },
    buildPrompt: (input) => {
      const stats = computeDiffStats(input.diff);
      const paths = extractChangedPaths(input.diff);

      const systemInstruction = `
You are a QA automation architect.
Analyze the diff and generate a comprehensive test plan.
Focus on edge cases, logical branches, and integration points affected by the changes.
Ensure test cases are actionable and verify specific behaviors.
Return strict JSON only.
`;
      const prompt = `
Repository: ${input.repository}
Language: ${input.language ?? 'detect'}
Test Framework: ${input.testFramework ?? 'detect'}
Stats: ${stats.files} files, +${stats.added}, -${stats.deleted}
Changed Files: ${paths.join(', ')}

Diff:
${input.diff}
`;
      return { systemInstruction, prompt };
    },
  });
}
