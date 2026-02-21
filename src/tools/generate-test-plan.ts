import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  computeDiffStatsAndPathsFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { createNoDiffError } from '../lib/diff-store.js';
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
    ...(TOOL_CONTRACT.thinkingLevel !== undefined
      ? { thinkingLevel: TOOL_CONTRACT.thinkingLevel }
      : undefined),
    ...(TOOL_CONTRACT.temperature !== undefined
      ? { temperature: TOOL_CONTRACT.temperature }
      : undefined),
    validateInput: (_input, ctx) => {
      const slot = ctx.diffSlot;
      if (!slot) return createNoDiffError();
      return validateDiffBudget(slot.diff);
    },
    formatOutcome: (result) => `${result.testCases.length} test cases`,
    formatOutput: (result) =>
      `Test Plan: ${result.summary}\n${result.testCases.length} cases proposed.`,
    transformResult: (input, result) => {
      const cappedTestCases = result.testCases.slice(
        0,
        input.maxTestCases ?? result.testCases.length
      );
      return { ...result, testCases: cappedTestCases };
    },
    buildPrompt: (input, ctx) => {
      const diff = ctx.diffSlot?.diff ?? '';
      const parsedFiles = parseDiffFiles(diff);
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
