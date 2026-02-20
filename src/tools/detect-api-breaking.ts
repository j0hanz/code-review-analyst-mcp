import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import { FLASH_MODEL } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { DetectApiBreakingInputSchema } from '../schemas/inputs.js';
import { DetectApiBreakingResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are an API compatibility analyst. Analyze the diff for breaking changes to public APIs, contracts, and interfaces.
A breaking change is any modification that would require existing callers or consumers to update their code.
Classify each breaking change with its affected element, nature of change, consumer impact, and suggested mitigation.
Return strict JSON only.
`;

function formatOptionalLine(label: string, value: string | undefined): string {
  return value === undefined ? '' : `\n${label}: ${value}`;
}

function buildDetectApiBreakingPrompt(input: {
  diff: string;
  language?: string | undefined;
}): string {
  const languageLine = formatOptionalLine('Language', input.language);
  return `${languageLine}\nDiff:\n${input.diff}`.trimStart();
}

export function registerDetectApiBreakingTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'detect_api_breaking_changes',
    title: 'Detect API Breaking Changes',
    description:
      'Detect breaking changes to public APIs, interfaces, and contracts in a unified diff.',
    inputSchema: DetectApiBreakingInputSchema,
    fullInputSchema: DetectApiBreakingInputSchema,
    resultSchema: DetectApiBreakingResultSchema,
    errorCode: 'E_DETECT_API_BREAKING',
    model: FLASH_MODEL,
    validateInput: (input) => validateDiffBudget(input.diff),
    formatOutcome: (result) =>
      `${result.breakingChanges.length} breaking change(s) found`,
    formatOutput: (result) =>
      result.hasBreakingChanges
        ? `API Breaking Changes: ${result.breakingChanges.length} found.`
        : 'No API breaking changes detected.',
    buildPrompt: (input) => ({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildDetectApiBreakingPrompt(input),
    }),
  });
}
