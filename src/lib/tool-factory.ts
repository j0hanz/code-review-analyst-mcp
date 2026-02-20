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
const DEFAULT_PROGRESS_CONTEXT = 'request';
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

  /** Optional context text used in progress messages. */
  progressContext?: (input: TInput) => string;

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
  const request: GeminiStructuredRequest = {
    systemInstruction: promptParts.systemInstruction,
    prompt: promptParts.prompt,
    responseSchema,
    onLog,
  };

  if (config.model !== undefined) {
    request.model = config.model;
  }
  if (config.thinkingBudget !== undefined) {
    request.thinkingBudget = config.thinkingBudget;
  }
  if (config.timeoutMs !== undefined) {
    request.timeoutMs = config.timeoutMs;
  }
  if (signal !== undefined) {
    request.signal = signal;
  }

  return request;
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
    _meta?: { progressToken?: unknown };
    sendNotification: (notification: {
      method: 'notifications/progress';
      params: {
        progressToken: string | number;
        progress: number;
        total?: number;
        message?: string;
      };
    }) => Promise<void>;
  },
  payload: {
    current: number;
    total?: number;
    message?: string;
  }
): Promise<void> {
  const progressToken = extra._meta?.progressToken;
  if (typeof progressToken !== 'string' && typeof progressToken !== 'number') {
    return;
  }

  try {
    const params: {
      progressToken: string | number;
      progress: number;
      total?: number;
      message?: string;
    } = {
      progressToken,
      progress: payload.current,
    };
    if (payload.total !== undefined) {
      params.total = payload.total;
    }
    if (payload.message !== undefined) {
      params.message = payload.message;
    }

    await extra.sendNotification({
      method: 'notifications/progress',
      params,
    });
  } catch {
    // Progress is best-effort; never fail the tool call.
  }
}

function createProgressReporter(extra: {
  _meta?: { progressToken?: unknown };
  sendNotification: (notification: {
    method: 'notifications/progress';
    params: {
      progressToken: string | number;
      progress: number;
      total?: number;
      message?: string;
    };
  }) => Promise<void>;
}): (payload: {
  current: number;
  total?: number;
  message?: string;
}) => Promise<void> {
  let lastCurrent = 0;
  let didSendTerminal = false;

  return async (payload): Promise<void> => {
    if (didSendTerminal) {
      return;
    }

    const current = Math.max(payload.current, lastCurrent);
    const total =
      payload.total !== undefined
        ? Math.max(payload.total, current)
        : undefined;

    await sendTaskProgress(extra, {
      current,
      ...(total !== undefined ? { total } : {}),
      ...(payload.message !== undefined ? { message: payload.message } : {}),
    });

    lastCurrent = current;
    if (total !== undefined && total === current) {
      didSendTerminal = true;
    }
  };
}

function normalizeProgressContext(context: string | undefined): string {
  const compact = context?.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return DEFAULT_PROGRESS_CONTEXT;
  }

  if (compact.length <= 80) {
    return compact;
  }

  return `${compact.slice(0, 77)}...`;
}

function formatProgressStep(
  toolName: string,
  context: string,
  metadata: string
): string {
  return `${toolName}: ${context} [${metadata}]`;
}

function formatProgressCompletion(
  toolName: string,
  context: string,
  outcome: string
): string {
  return `${toolName}: ${context} • ${outcome}`;
}

function toLoggingLevel(level: string): LoggingLevel {
  switch (level) {
    case 'debug':
    case 'info':
    case 'notice':
    case 'warning':
    case 'error':
    case 'critical':
    case 'alert':
    case 'emergency':
      return level;
    default:
      return 'error';
  }
}

function asObjectRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }

  return { payload: value };
}

function createGeminiLogger(
  server: McpServer,
  taskId: string
): (level: string, data: unknown) => Promise<void> {
  return async (level: string, data: unknown): Promise<void> => {
    try {
      await server.sendLoggingMessage({
        level: toLoggingLevel(level),
        logger: 'gemini',
        data: {
          requestId: getCurrentRequestId(),
          taskId,
          ...asObjectRecord(data),
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
          const reportProgress = createProgressReporter(extra);
          let progressContext = DEFAULT_PROGRESS_CONTEXT;

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

          const storeResultSafely = async (
            status: 'completed' | 'failed',
            result: CallToolResult
          ): Promise<void> => {
            try {
              await extra.taskStore.storeTaskResult(
                task.taskId,
                status,
                result
              );
            } catch {
              // storing the result failed, possibly because the task is already marked as failed due to an uncaught error. There's not much we can do at this point, so we swallow the error to avoid unhandled rejections.
            }
          };

          try {
            await reportProgress({
              current: 0,
              total: TASK_PROGRESS_TOTAL,
              message: formatProgressStep(
                config.name,
                progressContext,
                'start'
              ),
            });

            const onLog = createGeminiLogger(server, task.taskId);

            const inputRecord = parseToolInput<TInput>(
              input,
              config.fullInputSchema
            );
            progressContext = normalizeProgressContext(
              config.progressContext?.(inputRecord)
            );

            if (config.validateInput) {
              const validationError = await config.validateInput(inputRecord);
              if (validationError) {
                const validationMessage =
                  validationError.structuredContent.error?.message ??
                  INPUT_VALIDATION_FAILED;
                await updateStatusMessage(validationMessage);
                await reportProgress({
                  current: TASK_PROGRESS_TOTAL,
                  total: TASK_PROGRESS_TOTAL,
                  message: formatProgressCompletion(
                    config.name,
                    progressContext,
                    'failed'
                  ),
                });
                await storeResultSafely('completed', validationError);
                return;
              }
            }

            await reportProgress({
              current: 1,
              total: TASK_PROGRESS_TOTAL,
              message: formatProgressStep(
                config.name,
                progressContext,
                'input validated'
              ),
            });

            const { systemInstruction, prompt } =
              config.buildPrompt(inputRecord);

            await reportProgress({
              current: 2,
              total: TASK_PROGRESS_TOTAL,
              message: formatProgressStep(
                config.name,
                progressContext,
                'prompt prepared'
              ),
            });

            const raw = await generateStructuredJson(
              createGenerationRequest(
                config,
                { systemInstruction, prompt },
                responseSchema,
                onLog,
                extra.signal
              )
            );

            await reportProgress({
              current: 3,
              total: TASK_PROGRESS_TOTAL,
              message: formatProgressStep(
                config.name,
                progressContext,
                'model response received'
              ),
            });

            const parsed = config.resultSchema.parse(raw);

            const finalResult = (
              config.transformResult
                ? config.transformResult(inputRecord, parsed)
                : parsed
            ) as TFinal;

            const textContent = config.formatOutput
              ? config.formatOutput(finalResult)
              : undefined;

            await reportProgress({
              current: TASK_PROGRESS_TOTAL,
              total: TASK_PROGRESS_TOTAL,
              message: formatProgressCompletion(
                config.name,
                progressContext,
                'completed'
              ),
            });
            await storeResultSafely(
              'completed',
              createToolResponse(
                {
                  ok: true as const,
                  result: finalResult,
                },
                textContent
              )
            );
          } catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const errorMeta = classifyErrorMeta(error, errorMessage);
            await reportProgress({
              current: TASK_PROGRESS_TOTAL,
              total: TASK_PROGRESS_TOTAL,
              message: formatProgressCompletion(
                config.name,
                progressContext,
                'failed'
              ),
            });
            await updateStatusMessage(errorMessage);
            await storeResultSafely(
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

        queueMicrotask(() => {
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
