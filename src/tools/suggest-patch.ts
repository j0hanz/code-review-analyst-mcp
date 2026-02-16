import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { generateStructuredJson } from '../lib/gemini.js';
import { createToolResponse } from '../lib/tool-response.js';
import { SuggestPatchInputSchema } from '../schemas/inputs.js';
import {
  DefaultOutputSchema,
  PatchSuggestionResultSchema,
} from '../schemas/outputs.js';

const SuggestPatchJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    patch: { type: 'string' },
    validationChecklist: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'patch', 'validationChecklist'],
};

function buildPatchPrompt(input: {
  diff: string;
  findingTitle: string;
  findingDetails: string;
  patchStyle: 'minimal' | 'balanced' | 'defensive';
}): string {
  return [
    'You are producing a corrective patch for a code review issue.',
    'Return strict JSON only, no markdown fences.',
    `Patch style: ${input.patchStyle}`,
    `Finding title: ${input.findingTitle}`,
    `Finding details: ${input.findingDetails}`,
    'Patch output must be a valid unified diff snippet and avoid unrelated changes.',
    '',
    'Original unified diff:',
    input.diff,
  ].join('\n');
}

export function registerSuggestPatchTool(server: McpServer): void {
  server.registerTool(
    'suggest_patch',
    {
      title: 'Suggest Patch',
      description:
        'Generate a focused unified diff patch to address one selected review finding.',
      inputSchema: SuggestPatchInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const raw = await generateStructuredJson({
          prompt: buildPatchPrompt({
            diff: input.diff,
            findingTitle: input.findingTitle,
            findingDetails: input.findingDetails,
            patchStyle: input.patchStyle ?? 'balanced',
          }),
          responseSchema: SuggestPatchJsonSchema,
        });
        const parsed = PatchSuggestionResultSchema.parse(raw);

        return createToolResponse({
          ok: true,
          result: parsed,
        });
      } catch (error: unknown) {
        return createErrorResponse('E_SUGGEST_PATCH', getErrorMessage(error));
      }
    }
  );
}
