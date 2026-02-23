import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  buildStructuredToolRuntimeOptions,
  requireToolContract,
} from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { AnalyzeComplexityInputSchema } from '../schemas/inputs.js';
import { AnalyzeComplexityResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
Algorithm Complexity Analyst.
Analyze Big-O time/space complexity for changes.
Detect performance degradation vs original.
Identify bottlenecks: nested loops, unbounded recursion, heavy allocations.
Return strict JSON.
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
    ...buildStructuredToolRuntimeOptions(TOOL_CONTRACT),
    requiresDiff: true,
    formatOutcome: (result) =>
      result.isDegradation
        ? 'Performance degradation detected'
        : 'No degradation',
    formatOutput: (result) =>
      `Time=${result.timeComplexity}, Space=${result.spaceComplexity}. ${result.explanation}`,
    buildPrompt: (input, ctx) => {
      const diff = ctx.diffSlot?.diff ?? '';
      const languageLine = input.language
        ? `\nLanguage: ${input.language}`
        : '';

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt:
          `${languageLine}\nDiff:\n${diff}\n\nBased on the diff above, analyze the Big-O time and space complexity.`.trimStart(),
      };
    },
  });
}
