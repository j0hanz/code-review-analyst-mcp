import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  buildStructuredToolRuntimeOptions,
  requireToolContract,
} from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { DetectApiBreakingInputSchema } from '../schemas/inputs.js';
import { DetectApiBreakingResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
API Compatibility Analyst.
Detect breaking changes to public APIs/contracts/interfaces.
Breaking = consumer update required.
Classify: element, nature, impact, mitigation.
Return strict JSON.
`;
const TOOL_CONTRACT = requireToolContract('detect_api_breaking_changes');

export function registerDetectApiBreakingTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'detect_api_breaking_changes',
    title: 'Detect API Breaking Changes',
    description:
      'Detect breaking API changes. Prerequisite: generate_diff. Auto-infer language.',
    inputSchema: DetectApiBreakingInputSchema,
    fullInputSchema: DetectApiBreakingInputSchema,
    resultSchema: DetectApiBreakingResultSchema,
    errorCode: 'E_DETECT_API_BREAKING',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    ...buildStructuredToolRuntimeOptions(TOOL_CONTRACT),
    requiresDiff: true,
    formatOutcome: (result) =>
      `${result.breakingChanges.length} breaking change(s) found`,
    formatOutput: (result) =>
      result.hasBreakingChanges
        ? `${result.breakingChanges.length} breaking changes found.`
        : 'No breaking changes.',
    buildPrompt: (input, ctx) => {
      const diff = ctx.diffSlot?.diff ?? '';
      const languageLine = input.language
        ? `\nLanguage: ${input.language}`
        : '';

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt:
          `${languageLine}\nDiff:\n${diff}\n\nBased on the diff above, detect any breaking API changes.`.trimStart(),
      };
    },
  });
}
