import type {
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra,
} from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {
  CallToolResult,
  LoggingLevel,
} from '@modelcontextprotocol/sdk/types.js';

import { z } from 'zod';

import { DefaultOutputSchema } from '../schemas/outputs.js';
import { getErrorMessage, RETRYABLE_UPSTREAM_ERROR_PATTERN } from './errors.js';
import { stripJsonSchemaConstraints } from './gemini-schema.js';
import { generateStructuredJson, getCurrentRequestId } from './gemini.js';
import {
  createErrorToolResponse,
  createToolResponse,
  type ErrorMeta,
} from './tool-response.js';
import type { GeminiStructuredRequest } from './types.js';

export interface PromptParts {
  systemInstruction: string;
  prompt: string;
}

const DEFAULT_TASK_TTL_MS = 30 * 60 * 1_000;
const TASK_PROGRESS_TOTAL = 4;
const INPUT_VALIDATION_FAILED = 'Input validation failed';
const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const CANCELLED_ERROR_PATTERN = /cancelled|canceled/i;
const TIMEOUT_ERROR_PATTERN = /timed out|timeout/i;
const BUDGET_ERROR_PATTERN = /exceeds limit|max allowed size|input too large/i;

export interface StructuredToolTaskConfig<
  TInput extends object = Record<string, unknown>,
  TResult extends object = Record<string, unknown>,
  TFinal extends TResult = TResult,
> {
  /** Tool name registered with the MCP server (e.g. 'analyze_pr_impact'). */
  name: string;

  /** Human-readable title shown to clients. */
  title: string;

  /** Short description of the tool's purpose. */
  description: string;

  /** Zod schema or raw shape for MCP request validation at the transport boundary. */
  inputSchema: z.ZodType<TInput> | ZodRawShapeCompat;

  /** Zod schema for validating the complete tool input inside the handler. */
  fullInputSchema: z.ZodType<TInput>;

  /** Zod schema for parsing and validating the Gemini structured response. */
  resultSchema: z.ZodType<TResult>;

  /** Optional Zod schema used specifically for Gemini response validation. */
  geminiSchema?: z.ZodType;

  /** Stable error code returned on failure (e.g. 'E_INSPECT_QUALITY'). */
  errorCode: string;

  /** Optional post-processing hook called after resultSchema.parse(). The return value replaces the parsed result. */
  transformResult?: (input: TInput, result: TResult) => TFinal;

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

  /** Optional timeout in ms for the Gemini call. Defaults to 60,000 ms. Use DEFAULT_TIMEOUT_PRO_MS for Pro model calls. */
  timeoutMs?: number;

  /** Optional formatter for human-readable text output. */
  formatOutput?: (result: TFinal) => string;

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

function createGenerationRequest<
  TInput extends object,
  TResult extends object,
  TFinal extends TResult,
>(
  config: StructuredToolTaskConfig<TInput, TResult, TFinal>,
  promptParts: PromptParts,
  responseSchema: Record<string, unknown>,
  onLog: (level: string, data: unknown) => Promise<void>,
  signal?: AbortSignal
): GeminiStructuredRequest {
  return {
    systemInstruction: promptParts.systemInstruction,
    prompt: promptParts.prompt,
    responseSchema,
    onLog,
    ...(config.model !== undefined ? { model: config.model } : undefined),
    ...(config.thinkingBudget !== undefined
      ? { thinkingBudget: config.thinkingBudget }
      : undefined),
    ...(config.timeoutMs !== undefined
      ? { timeoutMs: config.timeoutMs }
      : undefined),
    ...(signal !== undefined ? { signal } : undefined),
  };
}

function isTerminalTaskStatus(status: string): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

function classifyErrorMeta(error: unknown, message: string): ErrorMeta {
  if (error instanceof z.ZodError || /validation/i.test(message)) {
    return {
      kind: 'validation',
      retryable: false,
    };
  }

  if (CANCELLED_ERROR_PATTERN.test(message)) {
    return {
      kind: 'cancelled',
      retryable: false,
    };
  }

  if (TIMEOUT_ERROR_PATTERN.test(message)) {
    return {
      kind: 'timeout',
      retryable: true,
    };
  }

  if (BUDGET_ERROR_PATTERN.test(message)) {
    return {
      kind: 'budget',
      retryable: false,
    };
  }

  if (RETRYABLE_UPSTREAM_ERROR_PATTERN.test(message)) {
    return {
      kind: 'upstream',
      retryable: true,
    };
  }

  return {
    kind: 'internal',
    retryable: false,
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

export function registerStructuredToolTask<
  TInput extends object,
  TResult extends object = Record<string, unknown>,
  TFinal extends TResult = TResult,
>(
  server: McpServer,
  config: StructuredToolTaskConfig<TInput, TResult, TFinal>
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
      createTask: async (
        input: unknown,
        extra: CreateTaskRequestHandlerExtra
      ) => {
        const task = await extra.taskStore.createTask({
          ttl: extra.taskRequestedTtl ?? DEFAULT_TASK_TTL_MS,
        });

        const runTask = async (): Promise<void> => {
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

          const storeResultIfTaskActive = async (
            status: 'completed' | 'failed',
            result: CallToolResult
          ): Promise<boolean> => {
            try {
              const currentTask = await extra.taskStore.getTask(task.taskId);
              if (isTerminalTaskStatus(currentTask.status)) {
                return false;
              }
            } catch {
              // Task may have been cancelled/cleaned up.
              return false;
            }

            try {
              await extra.taskStore.storeTaskResult(
                task.taskId,
                status,
                result
              );
              return true;
            } catch {
              // Ignore race conditions between cancellation and result persistence.
              return false;
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
                await updateStatusMessage(validationMessage);
                await storeResultIfTaskActive('failed', validationError);
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
                onLog,
                extra.signal
              )
            );

            await sendTaskProgress(extra, 3);

            const parsed = config.resultSchema.parse(raw);

            // When transformResult is absent, TFinal = TResult (by the generic default).
            // The cast is sound by construction; TypeScript cannot verify this statically.
            const finalResult = (
              config.transformResult
                ? config.transformResult(inputRecord, parsed)
                : parsed
            ) as TFinal;

            const textContent = config.formatOutput
              ? config.formatOutput(finalResult)
              : undefined;

            await storeResultIfTaskActive(
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
            const errorMeta = classifyErrorMeta(error, errorMessage);
            await updateStatusMessage(errorMessage);
            await storeResultIfTaskActive(
              'failed',
              createErrorToolResponse(
                config.errorCode,
                errorMessage,
                undefined,
                errorMeta
              )
            );
          }
        };

        setImmediate(() => {
          void runTask().catch((error: unknown) => {
            console.error(
              `[task-runner:${config.name}] ${getErrorMessage(error)}`
            );
          });
        });

        return { task };
      },
      getTask: async (_input: unknown, extra: TaskRequestHandlerExtra) => {
        return await extra.taskStore.getTask(extra.taskId);
      },
      getTaskResult: async (
        _input: unknown,
        extra: TaskRequestHandlerExtra
      ) => {
        return (await extra.taskStore.getTaskResult(
          extra.taskId
        )) as CallToolResult;
      },
    }
  );
}
