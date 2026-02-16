import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  type PromptParts,
  registerStructuredToolTask,
} from '../lib/tool-factory.js';
import { SuggestPatchInputSchema } from '../schemas/inputs.js';
import { PatchSuggestionResultSchema } from '../schemas/outputs.js';

const DEFAULT_PATCH_STYLE = 'balanced';

interface PatchPromptInput {
  diff: string;
  findingTitle: string;
  findingDetails: string;
  patchStyle?: 'minimal' | 'balanced' | 'defensive';
}

function buildPatchPrompt(input: PatchPromptInput): PromptParts {
  const systemInstruction = [
    'You are producing a corrective patch for a code review issue.',
    'Return strict JSON only, no markdown fences.',
  ].join('\n');

  const prompt = [
    `Patch style: ${input.patchStyle ?? DEFAULT_PATCH_STYLE}`,
    `Finding title: ${input.findingTitle}`,
    `Finding details: ${input.findingDetails}`,
    'Patch output must be a valid unified diff snippet and avoid unrelated changes.',
    '',
    'Original unified diff:',
    input.diff,
  ].join('\n');

  return { systemInstruction, prompt };
}

export function registerSuggestPatchTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'suggest_patch',
    title: 'Suggest Patch',
    description:
      'Generate a focused unified diff patch to address one selected review finding.',
    inputSchema: SuggestPatchInputSchema.shape,
    resultSchema: PatchSuggestionResultSchema,
    errorCode: 'E_SUGGEST_PATCH',
    buildPrompt: (input) =>
      buildPatchPrompt(input as unknown as PatchPromptInput),
  });
}
