import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {
  CallToolResult,
  LoggingLevel,
} from '@modelcontextprotocol/sdk/types.js';

import { z } from 'zod';

import { DefaultOutputSchema } from '../schemas/outputs.js';
import { getErrorMessage } from './errors.js';
import { stripJsonSchemaConstraints } from './gemini-schema.js';
import { generateStructuredJson, getCurrentRequestId } from './gemini.js';
import {
  createErrorToolResponse,
  createToolResponse,
} from './tool-response.js';

export interface PromptParts {
  systemInstruction: string;
  prompt: string;
}

const DEFAULT_TASK_TTL_MS = 30 * 60 * 1_000;
const TASK_PROGRESS_TOTAL = 4;
const INPUT_VALIDATION_FAILED = 'Input validation failed';

export interface StructuredToolTaskConfig<
  TInput extends object = Record<string, unknown>,
> {
  /** Tool name registered with the MCP server (e.g. 'review_diff'). */
  name: string;

  /** Human-readable title shown to clients. */
  title: string;

  /** Short description of the tool's purpose. */
  description: string;

  /** Zod schema shape for the tool input. Used by the MCP SDK to strip unknown fields before the handler runs. */
  inputSchema: ZodRawShapeCompat;

  /** Zod schema for validating the complete tool input, including all expected fields. This is used within the handler to validate the actual input shape after the MCP SDK has stripped unknown fields. */
  fullInputSchema: z.ZodType<TInput>;

  /** Zod schema for parsing and validating the Gemini structured response. */
  resultSchema: z.ZodType;

  /** Optional Zod schema used specifically for Gemini response validation. */
  geminiSchema?: z.ZodType;

  /** Stable error code returned on failure (e.g. 'E_REVIEW_DIFF'). */
  errorCode: string;

  /** Optional post-processing hook called after resultSchema.parse(). Returns the (possibly modified) final result. */
  transformResult?: (input: TInput, result: unknown) => unknown;

  /** Optional validation hook for input parameters. */
  validateInput?: (
    input: TInput
  ) =>
    | Promise<ReturnType<typeof createErrorToolResponse> | undefined>
    | ReturnType<typeof createErrorToolResponse>
    | undefined;

  /** Optional Gemini model to use (e.g. 'gemini-2.5-pro'). */
  model?: string;

  /** Optional thinking budget in tokens. */
  thinkingBudget?: number;

  /** Optional formatter for human-readable text output. */
  formatOutput?: (result: unknown) => string;

  /** Builds the system instruction and user prompt from parsed tool input. */
  buildPrompt: (input: TInput) => PromptParts;
}

function createGeminiResponseSchema(config: {
  geminiSchema: z.ZodType | undefined;
  resultSchema: z.ZodType;
}): Record<string, unknown> {
  const sourceSchema = config.geminiSchema ?? config.resultSchema;
  return stripJsonSchemaConstraints(
    z.toJSONSchema(sourceSchema) as Record<string, unknown>
  );
}

function parseToolInput<TInput extends object>(
  input: unknown,
  fullInputSchema: z.ZodType<TInput>
): TInput {
  return fullInputSchema.parse(input);
}

function createGenerationRequest<TInput extends object>(
  config: StructuredToolTaskConfig<TInput>,
  promptParts: PromptParts,
  responseSchema: Record<string, unknown>,
  onLog: (level: string, data: unknown) => Promise<void>
): {
  model?: string;
  thinkingBudget?: number;
  onLog: (level: string, data: unknown) => Promise<void>;
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
} {
  return {
    systemInstruction: promptParts.systemInstruction,
    prompt: promptParts.prompt,
    responseSchema,
    ...(config.model ? { model: config.model } : undefined),
    ...(config.thinkingBudget
      ? { thinkingBudget: config.thinkingBudget }
      : undefined),
    onLog,
  };
}

async function sendTaskProgress(
  extra: {
    _meta?: { progressToken?: string | number | undefined };
    sendNotification: (notification: {
      method: 'notifications/progress';
      params: {
        progressToken: string | number;
        progress: number;
        total: number;
      };
    }) => Promise<void>;
  },
  progress: number
): Promise<void> {
  const progressToken = extra._meta?.progressToken;
  if (progressToken == null) {
    return;
  }

  try {
    await extra.sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress,
        total: TASK_PROGRESS_TOTAL,
      },
    });
  } catch {
    // Progress is best-effort; never fail the tool call.
  }
}

function createGeminiLogger(
  server: McpServer,
  taskId: string
): (level: string, data: unknown) => Promise<void> {
  return async (level: string, data: unknown): Promise<void> => {
    try {
      await server.sendLoggingMessage({
        level: level as LoggingLevel,
        logger: 'gemini',
        data: {
          requestId: getCurrentRequestId(),
          taskId,
          ...(data as object),
        },
      });
    } catch {
      // Logging is best-effort; never fail the tool call.
    }
  };
}

export function registerStructuredToolTask<TInput extends object>(
  server: McpServer,
  config: StructuredToolTaskConfig<TInput>
): void {
  const responseSchema = createGeminiResponseSchema({
    geminiSchema: config.geminiSchema,
    resultSchema: config.resultSchema,
  });

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
          ttl: extra.taskRequestedTtl ?? DEFAULT_TASK_TTL_MS,
        });
        void (async () => {
          const updateStatusMessage = async (
            message: string
          ): Promise<void> => {
            try {
              await extra.taskStore.updateTaskStatus(
                task.taskId,
                'working',
                message
              );
            } catch {
              // statusMessage is best-effort; task may already be terminal.
            }
          };

          try {
            const onLog = createGeminiLogger(server, task.taskId);

            const inputRecord = parseToolInput<TInput>(
              input,
              config.fullInputSchema
            );

            if (config.validateInput) {
              const validationError = await config.validateInput(inputRecord);
              if (validationError) {
                const validationMessage =
                  validationError.structuredContent.error?.message ??
                  INPUT_VALIDATION_FAILED;
                await extra.taskStore.updateTaskStatus(
                  task.taskId,
                  'failed',
                  validationMessage
                );
                await extra.taskStore.storeTaskResult(
                  task.taskId,
                  'failed',
                  validationError
                );
                return;
              }
            }

            await sendTaskProgress(extra, 1);

            const { systemInstruction, prompt } =
              config.buildPrompt(inputRecord);

            await sendTaskProgress(extra, 2);

            const raw = await generateStructuredJson(
              createGenerationRequest(
                config,
                { systemInstruction, prompt },
                responseSchema,
                onLog
              )
            );

            await sendTaskProgress(extra, 3);

            const parsed: unknown = config.resultSchema.parse(raw);

            const finalResult = config.transformResult
              ? config.transformResult(inputRecord, parsed)
              : parsed;

            const textContent = config.formatOutput
              ? config.formatOutput(finalResult)
              : undefined;

            await extra.taskStore.updateTaskStatus(task.taskId, 'completed');

            await extra.taskStore.storeTaskResult(
              task.taskId,
              'completed',
              createToolResponse(
                {
                  ok: true as const,
                  result: finalResult,
                },
                textContent
              )
            );

            await sendTaskProgress(extra, 4);
          } catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            await updateStatusMessage(errorMessage);
            await extra.taskStore.updateTaskStatus(
              task.taskId,
              'failed',
              errorMessage
            );
            await extra.taskStore.storeTaskResult(
              task.taskId,
              'failed',
              createErrorToolResponse(
                config.errorCode,
                errorMessage,
                undefined,
                {
                  kind: 'upstream',
                  retryable: true,
                }
              )
            );
          }
        })();

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
