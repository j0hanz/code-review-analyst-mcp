import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  DEFAULT_TIMEOUT_PRO_MS,
  PRO_MODEL,
  PRO_THINKING_BUDGET,
} from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { AnalyzeComplexityInputSchema } from '../schemas/inputs.js';
import { AnalyzeComplexityResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are an algorithm complexity analyst. Analyze the diff to identify Big-O time and space complexity for added or modified functions and algorithms.
Detect if the change introduces a performance degradation compared to the original code.
Identify potential bottlenecks arising from loop nesting, recursive calls, and auxiliary data structure usage.
Return strict JSON only.
`;

function formatOptionalLine(label: string, value: string | undefined): string {
  return value === undefined ? '' : `\n${label}: ${value}`;
}

function buildAnalyzeComplexityPrompt(input: {
  diff: string;
  language?: string | undefined;
}): string {
  const languageLine = formatOptionalLine('Language', input.language);
  return `${languageLine}\nDiff:\n${input.diff}`.trimStart();
}

export function registerAnalyzeComplexityTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'analyze_time_space_complexity',
    title: 'Analyze Time & Space Complexity',
    description:
      'Analyze Big-O time and space complexity of code changes and detect performance degradations.',
    inputSchema: AnalyzeComplexityInputSchema,
    fullInputSchema: AnalyzeComplexityInputSchema,
    resultSchema: AnalyzeComplexityResultSchema,
    errorCode: 'E_ANALYZE_COMPLEXITY',
    model: PRO_MODEL,
    thinkingBudget: PRO_THINKING_BUDGET,
    timeoutMs: DEFAULT_TIMEOUT_PRO_MS,
    validateInput: (input) => validateDiffBudget(input.diff),
    formatOutcome: (result) =>
      result.isDegradation
        ? 'Performance degradation detected'
        : 'No degradation',
    formatOutput: (result) =>
      `Complexity Analysis: Time=${result.timeComplexity}, Space=${result.spaceComplexity}. ${result.explanation}`,
    buildPrompt: (input) => ({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildAnalyzeComplexityPrompt(input),
    }),
  });
}
