import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { zodToJsonSchema } from 'zod-to-json-schema';

import { exceedsDiffBudget, getDiffBudgetError } from '../lib/diff-budget.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { generateStructuredJson } from '../lib/gemini.js';
import { createToolResponse } from '../lib/tool-response.js';
import { SuggestPatchInputSchema } from '../schemas/inputs.js';
import {
  DefaultOutputSchema,
  PatchSuggestionResultSchema,
} from '../schemas/outputs.js';

const DEFAULT_PATCH_STYLE = 'balanced';

interface PatchPromptInput {
  diff: string;
  findingTitle: string;
  findingDetails: string;
  patchStyle: 'minimal' | 'balanced' | 'defensive';
}

function getDiffBudgetErrorResponse(
  diff: string
): ReturnType<typeof createErrorResponse> | undefined {
  if (!exceedsDiffBudget(diff)) {
    return undefined;
  }

  return createErrorResponse(
    'E_INPUT_TOO_LARGE',
    getDiffBudgetError(diff.length)
  );
}

export function buildPatchPrompt(input: PatchPromptInput): {
  systemInstruction: string;
  prompt: string;
} {
  const systemInstruction = [
    'You are producing a corrective patch for a code review issue.',
    'Return strict JSON only, no markdown fences.',
  ].join('\n');

  const prompt = [
    `Patch style: ${input.patchStyle}`,
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
  const suggestPatchInputShape = SuggestPatchInputSchema.shape;

  server.experimental.tasks.registerToolTask<
    typeof suggestPatchInputShape,
    typeof DefaultOutputSchema
  >(
    'suggest_patch',
    {
      title: 'Suggest Patch',
      description:
        'Generate a focused unified diff patch to address one selected review finding.',
      inputSchema: suggestPatchInputShape,
      outputSchema: DefaultOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      execution: {
        taskSupport: 'optional',
      },
    },
    {
      createTask: async (input, extra) => {
        const task = await extra.taskStore.createTask({
          ttl: extra.taskRequestedTtl ?? null,
        });

        try {
          const progressToken = extra._meta?.progressToken;
          const sendProgress = async (
            progress: number,
            message: string
          ): Promise<void> => {
            if (
              typeof progressToken !== 'string' &&
              typeof progressToken !== 'number'
            ) {
              return;
            }

            await extra.sendNotification({
              method: 'notifications/progress',
              params: {
                progressToken,
                progress,
                total: 100,
                message,
              },
            });
          };

          await sendProgress(5, 'Starting suggest_patch');

          const budgetError = getDiffBudgetErrorResponse(input.diff);
          if (budgetError) {
            await extra.taskStore.storeTaskResult(
              task.taskId,
              'completed',
              budgetError
            );
            return { task };
          }

          const { systemInstruction, prompt } = buildPatchPrompt({
            diff: input.diff,
            findingTitle: input.findingTitle,
            findingDetails: input.findingDetails,
            patchStyle: input.patchStyle ?? DEFAULT_PATCH_STYLE,
          });
          const responseSchema = zodToJsonSchema(
            PatchSuggestionResultSchema
          ) as Record<string, unknown>;

          const raw = await generateStructuredJson({
            systemInstruction,
            prompt,
            responseSchema,
            onProgress: async (update) => {
              await sendProgress(
                update.progress,
                update.message ?? 'suggest_patch in progress'
              );
            },
          });
          const parsed = PatchSuggestionResultSchema.parse(raw);

          await sendProgress(100, 'Completed suggest_patch');

          await extra.taskStore.storeTaskResult(
            task.taskId,
            'completed',
            createToolResponse({
              ok: true,
              result: parsed,
            })
          );
        } catch (error: unknown) {
          await extra.taskStore.storeTaskResult(
            task.taskId,
            'failed',
            createErrorResponse('E_SUGGEST_PATCH', getErrorMessage(error))
          );
        }

        return { task };
      },
      getTask: async (_input, extra) => {
        return await extra.taskStore.getTask(extra.taskId);
      },
      getTaskResult: async (_input, extra) => {
        return (await extra.taskStore.getTaskResult(
          extra.taskId
        )) as CallToolResult;
      },
    }
  );
}
