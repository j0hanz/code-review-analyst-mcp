import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { z } from 'zod';

import { DefaultOutputSchema } from '../schemas/outputs.js';
import { getErrorMessage } from './errors.js';
import { stripJsonSchemaConstraints } from './gemini-schema.js';
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

  /** Full Zod schema for runtime input re-validation (rejects unknown fields). */
  fullInputSchema?: z.ZodType;

  /** Zod schema for parsing and validating the Gemini structured response. */
  resultSchema: z.ZodType;

  /** Optional Zod schema used specifically for Gemini response validation. */
  geminiSchema?: z.ZodType;

  /** Stable error code returned on failure (e.g. 'E_REVIEW_DIFF'). */
  errorCode: string;

  /** Optional validation hook for input parameters. */
  validateInput?: (
    input: TInput
  ) =>
    | Promise<ReturnType<typeof createErrorToolResponse> | undefined>
    | ReturnType<typeof createErrorToolResponse>
    | undefined;

  /** Builds the system instruction and user prompt from parsed tool input. */
  buildPrompt: (input: TInput) => PromptParts;
}

export function registerStructuredToolTask<TInput extends object>(
  server: McpServer,
  config: StructuredToolTaskConfig<TInput>
): void {
  const responseSchema = config.geminiSchema
    ? (z.toJSONSchema(config.geminiSchema) as Record<string, unknown>)
    : stripJsonSchemaConstraints(
        z.toJSONSchema(config.resultSchema) as Record<string, unknown>
      );

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

        const progressToken = extra._meta?.progressToken;
        const sendProgress = async (
          progress: number,
          total: number
        ): Promise<void> => {
          if (progressToken == null) return;
          try {
            await extra.sendNotification({
              method: 'notifications/progress',
              params: { progressToken, progress, total },
            });
          } catch {
            // Progress is best-effort; never fail the tool call.
          }
        };

        try {
          const inputRecord = config.fullInputSchema
            ? (config.fullInputSchema.parse(input) as TInput)
            : (input as TInput);

          if (config.validateInput) {
            const validationError = await config.validateInput(inputRecord);
            if (validationError) {
              await extra.taskStore.storeTaskResult(
                task.taskId,
                'failed',
                validationError
              );
              return { task };
            }
          }

          await sendProgress(1, 4);

          const { systemInstruction, prompt } = config.buildPrompt(inputRecord);

          await sendProgress(2, 4);

          const raw = await generateStructuredJson({
            systemInstruction,
            prompt,
            responseSchema,
            signal: extra.signal,
          });

          await sendProgress(3, 4);

          const parsed: unknown = config.resultSchema.parse(raw);

          await extra.taskStore.storeTaskResult(
            task.taskId,
            'completed',
            createToolResponse({
              ok: true as const,
              result: parsed,
            })
          );

          await sendProgress(4, 4);
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
