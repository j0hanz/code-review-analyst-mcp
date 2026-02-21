import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import { createNoDiffError, getDiff } from '../lib/diff-store.js';
import { requireToolContract } from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { DetectApiBreakingInputSchema } from '../schemas/inputs.js';
import { DetectApiBreakingResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are an API compatibility analyst. Analyze the diff for breaking changes to public APIs, contracts, and interfaces.
A breaking change is any modification that would require existing callers or consumers to update their code.
Classify each breaking change with its affected element, nature of change, consumer impact, and suggested mitigation.
Return strict JSON only.
`;
const TOOL_CONTRACT = requireToolContract('detect_api_breaking_changes');

export function registerDetectApiBreakingTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'detect_api_breaking_changes',
    title: 'Detect API Breaking Changes',
    description:
      'Detect breaking changes to public APIs in the cached diff. Call generate_diff first.',
    inputSchema: DetectApiBreakingInputSchema,
    fullInputSchema: DetectApiBreakingInputSchema,
    resultSchema: DetectApiBreakingResultSchema,
    errorCode: 'E_DETECT_API_BREAKING',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    validateInput: () => {
      const slot = getDiff();
      if (!slot) return createNoDiffError();
      return validateDiffBudget(slot.diff);
    },
    formatOutcome: (result) =>
      `${result.breakingChanges.length} breaking change(s) found`,
    formatOutput: (result) =>
      result.hasBreakingChanges
        ? `API Breaking Changes: ${result.breakingChanges.length} found.`
        : 'No API breaking changes detected.',
    buildPrompt: (input) => {
      const slot = getDiff();
      const diff = slot?.diff ?? '';
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
