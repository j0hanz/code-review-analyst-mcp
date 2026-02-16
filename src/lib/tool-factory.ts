import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { DefaultOutputSchema } from '../schemas/outputs.js';
import { exceedsDiffBudget, getDiffBudgetError } from './diff-budget.js';
import { getErrorMessage } from './errors.js';
import { generateStructuredJson } from './gemini.js';
import {
  createErrorToolResponse,
  createToolResponse,
} from './tool-response.js';

export interface PromptParts {
  systemInstruction: string;
  prompt: string;
}

export interface StructuredToolTaskConfig<
  TInput extends object = Record<string, unknown>,
> {
  /** Tool name registered with the MCP server (e.g. 'review_diff'). */
  name: string;

  /** Human-readable title shown to clients. */
  title: string;

  /** Short description of the tool's purpose. */
  description: string;

  /** Zod shape object (e.g. `MySchema.shape`) used as the MCP input schema. */
  inputSchema: ZodRawShapeCompat;

  /** Zod schema for parsing and validating the Gemini structured response. */
  resultSchema: z.ZodTypeAny;

  /** Stable error code returned on failure (e.g. 'E_REVIEW_DIFF'). */
  errorCode: string;

  /** Builds the system instruction and user prompt from parsed tool input. */
  buildPrompt: (input: TInput) => PromptParts;
}

function getDiffBudgetErrorResponse(
  diff: string
): ReturnType<typeof createErrorToolResponse> | undefined {
  if (!exceedsDiffBudget(diff)) {
    return undefined;
  }

  return createErrorToolResponse(
    'E_INPUT_TOO_LARGE',
    getDiffBudgetError(diff.length)
  );
}

async function sendProgress(
  progressToken: string | number | undefined,
  sendNotification: (notification: {
    method: string;
    params: Record<string, unknown>;
  }) => Promise<void>,
  progress: number,
  message: string
): Promise<void> {
  if (typeof progressToken !== 'string' && typeof progressToken !== 'number') {
    return;
  }

  await sendNotification({
    method: 'notifications/progress',
    params: {
      progressToken,
      progress,
      total: 100,
      message,
    },
  });
}

export function registerStructuredToolTask<TInput extends object>(
  server: McpServer,
  config: StructuredToolTaskConfig<TInput>
): void {
  server.experimental.tasks.registerToolTask(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
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
          const notify = async (
            progress: number,
            message: string
          ): Promise<void> => {
            await sendProgress(
              progressToken,
              async (notification) => {
                await extra.sendNotification(
                  notification as Parameters<typeof extra.sendNotification>[0]
                );
              },
              progress,
              message
            );
          };

          await notify(5, `Starting ${config.name}`);

          const inputRecord = input as TInput;
          const { diff } = input as Record<string, unknown>;

          if (typeof diff === 'string') {
            const budgetError = getDiffBudgetErrorResponse(diff);
            if (budgetError) {
              await extra.taskStore.storeTaskResult(
                task.taskId,
                'completed',
                budgetError
              );
              return { task };
            }
          }

          const { systemInstruction, prompt } = config.buildPrompt(inputRecord);

          const responseSchema = zodToJsonSchema(
            config.resultSchema as Parameters<typeof zodToJsonSchema>[0]
          ) as Record<string, unknown>;

          const raw = await generateStructuredJson({
            systemInstruction,
            prompt,
            responseSchema,
            signal: extra.signal,
            onProgress: async (update) => {
              await notify(
                update.progress,
                update.message ?? `${config.name} in progress`
              );
            },
          });
          const parsed: unknown = config.resultSchema.parse(raw);

          await notify(100, `Completed ${config.name}`);

          await extra.taskStore.storeTaskResult(
            task.taskId,
            'completed',
            createToolResponse({
              ok: true as const,
              result: parsed,
            })
          );
        } catch (error: unknown) {
          await extra.taskStore.storeTaskResult(
            task.taskId,
            'failed',
            createErrorToolResponse(config.errorCode, getErrorMessage(error))
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
