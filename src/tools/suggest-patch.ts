import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  type PromptParts,
  registerStructuredToolTask,
} from '../lib/tool-factory.js';
import { SuggestPatchInputSchema } from '../schemas/inputs.js';
import { PatchSuggestionResultSchema } from '../schemas/outputs.js';

const DEFAULT_PATCH_STYLE = 'balanced';
// Hoisted: avoids array allocation + join on every request.
const SYSTEM_INSTRUCTION =
  'You are producing a corrective patch for a code review issue.\nReturn strict JSON only, no markdown fences.';

type PatchPromptInput = z.infer<typeof SuggestPatchInputSchema>;

function joinPromptLines(lines: readonly string[]): string {
  return lines.join('\n');
}

function buildPatchPrompt(input: PatchPromptInput): PromptParts {
  const prompt = joinPromptLines([
    `Patch style: ${input.patchStyle ?? DEFAULT_PATCH_STYLE}`,
    `Finding title: ${input.findingTitle}`,
    `Finding details: ${input.findingDetails}`,
    'Patch output must be a valid unified diff snippet and avoid unrelated changes.',
    '',
    'Original unified diff:',
    input.diff,
  ]);

  return { systemInstruction: SYSTEM_INSTRUCTION, prompt };
}

export function formatPatchOutput(result: unknown): string {
  const r = result as z.infer<typeof PatchSuggestionResultSchema>;
  return `Patch Generated: ${r.summary}`;
}

export function registerSuggestPatchTool(server: McpServer): void {
  registerStructuredToolTask<PatchPromptInput>(server, {
    name: 'suggest_patch',
    title: 'Suggest Patch',
    description:
      'Generate a focused unified diff patch to address one selected review finding.',
    inputSchema: SuggestPatchInputSchema.shape,
    fullInputSchema: SuggestPatchInputSchema,
    resultSchema: PatchSuggestionResultSchema,
    validateInput: (input) => validateDiffBudget(input.diff),
    errorCode: 'E_SUGGEST_PATCH',
    buildPrompt: buildPatchPrompt,
    formatOutput: formatPatchOutput,
  });
}
