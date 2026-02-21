import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import { createNoDiffError } from '../lib/diff-store.js';
import { requireToolContract } from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { AnalyzeComplexityInputSchema } from '../schemas/inputs.js';
import { AnalyzeComplexityResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are an algorithm complexity analyst. Analyze the diff to identify Big-O time and space complexity for added or modified functions and algorithms.
Detect if the change introduces a performance degradation compared to the original code.
Identify potential bottlenecks arising from loop nesting, recursive calls, and auxiliary data structure usage.
Return strict JSON only.
`;
const TOOL_CONTRACT = requireToolContract('analyze_time_space_complexity');

export function registerAnalyzeComplexityTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'analyze_time_space_complexity',
    title: 'Analyze Time & Space Complexity',
    description:
      'Analyze Big-O complexity. Prerequisite: generate_diff. Auto-infer language.',
    inputSchema: AnalyzeComplexityInputSchema,
    fullInputSchema: AnalyzeComplexityInputSchema,
    resultSchema: AnalyzeComplexityResultSchema,
    errorCode: 'E_ANALYZE_COMPLEXITY',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    ...(TOOL_CONTRACT.thinkingBudget !== undefined
      ? { thinkingBudget: TOOL_CONTRACT.thinkingBudget }
      : undefined),
    ...(TOOL_CONTRACT.temperature !== undefined
      ? { temperature: TOOL_CONTRACT.temperature }
      : undefined),
    validateInput: (_input, ctx) => {
      const slot = ctx.diffSlot;
      if (!slot) return createNoDiffError();
      return validateDiffBudget(slot.diff);
    },
    formatOutcome: (result) =>
      result.isDegradation
        ? 'Performance degradation detected'
        : 'No degradation',
    formatOutput: (result) =>
      `Complexity Analysis: Time=${result.timeComplexity}, Space=${result.spaceComplexity}. ${result.explanation}`,
    buildPrompt: (input, ctx) => {
      const diff = ctx.diffSlot?.diff ?? '';
      const languageLine = input.language
        ? `\nLanguage: ${input.language}`
        : '';

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `${languageLine}\nDiff:\n${diff}`.trimStart(),
      };
    },
  });
}
