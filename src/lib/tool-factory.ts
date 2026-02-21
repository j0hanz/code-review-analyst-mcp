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
import { type DiffSlot, getDiff } from './diff-store.js';
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

/**
 * Immutable snapshot of server-side state captured once at the start of a
 * tool execution, before `validateInput` runs.  Threading it through both
 * `validateInput` and `buildPrompt` eliminates the TOCTOU gap that would
 * otherwise allow a concurrent `generate_diff` call to replace the cached
 * diff between the budget check and prompt assembly.
 */
export interface ToolExecutionContext {
  readonly diffSlot: DiffSlot | undefined;
}

const DEFAULT_TASK_TTL_MS = 30 * 60 * 1_000;
const TASK_PROGRESS_TOTAL = 4;
const INPUT_VALIDATION_FAILED = 'Input validation failed';
const DEFAULT_PROGRESS_CONTEXT = 'request';
const CANCELLED_ERROR_PATTERN = /cancelled|canceled/i;
const TIMEOUT_ERROR_PATTERN = /timed out|timeout/i;
const BUDGET_ERROR_PATTERN = /exceeds limit|max allowed size|input too large/i;
const BUSY_ERROR_PATTERN = /too many concurrent/i;
const MAX_SCHEMA_RETRIES = 1;

type ProgressToken = string | number;

interface ProgressNotificationParams {
  progressToken: ProgressToken;
  progress: number;
  total?: number;
  message?: string;
}

interface ProgressPayload {
  current: number;
  total?: number;
  message?: string;
}

interface ProgressExtra {
  _meta?: { progressToken?: unknown };
  sendNotification: (notification: {
    method: 'notifications/progress';
    params: ProgressNotificationParams;
  }) => Promise<void>;
}

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
  transformResult?: (
    input: TInput,
    result: TResult,
    ctx: ToolExecutionContext
  ) => TFinal;

  /** Optional validation hook for input parameters. */
  validateInput?: (
    input: TInput,
    ctx: ToolExecutionContext
  ) =>
    | Promise<ReturnType<typeof createErrorToolResponse> | undefined>
    | ReturnType<typeof createErrorToolResponse>
    | undefined;

  /** Optional Gemini model to use (e.g. 'gemini-2.5-pro'). */
  model?: string;

  /** Optional thinking budget in tokens. */
  thinkingBudget?: number;

  /** Optional timeout in ms for the Gemini call. Defaults to 90,000 ms. Use DEFAULT_TIMEOUT_PRO_MS for Pro model calls. */
  timeoutMs?: number;

  /** Optional max output tokens for Gemini. */
  maxOutputTokens?: number;

  /** Optional opt-in to Gemini thought output. Defaults to false. */
  includeThoughts?: boolean;

  /** Optional formatter for human-readable text output. */
  formatOutput?: (result: TFinal) => string;

  /** Optional context text used in progress messages. */
  progressContext?: (input: TInput) => string;

  /** Optional short outcome suffix for the completion progress message (e.g., "3 findings"). */
  formatOutcome?: (result: TFinal) => string;

  /** Builds the system instruction and user prompt from parsed tool input. */
  buildPrompt: (input: TInput, ctx: ToolExecutionContext) => PromptParts;
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
  if (config.maxOutputTokens !== undefined) {
    request.maxOutputTokens = config.maxOutputTokens;
  }
  if (config.includeThoughts !== undefined) {
    request.includeThoughts = config.includeThoughts;
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

  if (isRetryableUpstreamMessage(message)) {
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

function isRetryableUpstreamMessage(message: string): boolean {
  return (
    RETRYABLE_UPSTREAM_ERROR_PATTERN.test(message) ||
    BUSY_ERROR_PATTERN.test(message)
  );
}

async function sendTaskProgress(
  extra: ProgressExtra,
  payload: ProgressPayload
): Promise<void> {
  const progressToken = extra._meta?.progressToken;
  if (typeof progressToken !== 'string' && typeof progressToken !== 'number') {
    return;
  }

  try {
    const params: ProgressNotificationParams = {
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

function createProgressReporter(
  extra: ProgressExtra
): (payload: ProgressPayload) => Promise<void> {
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

    const progressPayload: ProgressPayload = { current };
    if (total !== undefined) {
      progressPayload.total = total;
    }
    if (payload.message !== undefined) {
      progressPayload.message = payload.message;
    }

    await sendTaskProgress(extra, progressPayload);

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
  const prefix = metadata === 'starting' ? '▸' : '◦';
  return `${prefix} ${toolName}: ${context} [${metadata}]`;
}

function friendlyModelName(model: string | undefined): string {
  if (!model) return 'model';
  if (model.includes('pro')) return 'Pro';
  if (model.includes('flash')) return 'Flash';
  return 'model';
}

function formatProgressCompletion(
  toolName: string,
  context: string,
  outcome: string,
  success = true
): string {
  const prefix = success ? '◆' : '◇';
  return `${prefix} ${toolName}: ${context} • ${outcome}`;
}

async function reportProgressStepUpdate(
  reportProgress: (payload: ProgressPayload) => Promise<void>,
  toolName: string,
  context: string,
  current: number,
  metadata: string
): Promise<void> {
  await reportProgress({
    current,
    total: TASK_PROGRESS_TOTAL,
    message: formatProgressStep(toolName, context, metadata),
  });
}

async function reportProgressCompletionUpdate(
  reportProgress: (payload: ProgressPayload) => Promise<void>,
  toolName: string,
  context: string,
  outcome: string,
  success = true
): Promise<void> {
  await reportProgress({
    current: TASK_PROGRESS_TOTAL,
    total: TASK_PROGRESS_TOTAL,
    message: formatProgressCompletion(toolName, context, outcome, success),
  });
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

export function wrapToolHandler<TInput, TResult extends CallToolResult>(
  options: {
    toolName: string;
    progressContext?: (input: TInput) => string;
  },
  handler: (input: TInput, extra: ProgressExtra) => Promise<TResult> | TResult
) {
  return async (input: TInput, extra: ProgressExtra): Promise<TResult> => {
    const context = normalizeProgressContext(options.progressContext?.(input));

    // Start progress (0/1)
    await sendTaskProgress(extra, {
      current: 0,
      total: 1,
      message: formatProgressStep(options.toolName, context, 'starting'),
    });

    try {
      const result = await handler(input, extra);

      // End progress (1/1)
      const outcome = result.isError ? 'failed' : 'completed';
      const success = !result.isError;

      await sendTaskProgress(extra, {
        current: 1,
        total: 1,
        message: formatProgressCompletion(
          options.toolName,
          context,
          outcome,
          success
        ),
      });

      return result;
    } catch (error) {
      // Progress is best-effort; must never mask the original error.
      try {
        await sendTaskProgress(extra, {
          current: 1,
          total: 1,
          message: formatProgressCompletion(
            options.toolName,
            context,
            'failed',
            false
          ),
        });
      } catch {
        // Swallow progress delivery errors so the original error propagates.
      }
      throw error;
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
        idempotentHint: true,
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
            const onLog = createGeminiLogger(server, task.taskId);

            const inputRecord = parseToolInput<TInput>(
              input,
              config.fullInputSchema
            );
            progressContext = normalizeProgressContext(
              config.progressContext?.(inputRecord)
            );

            // Snapshot the diff slot ONCE before any async work so that
            // validateInput and buildPrompt observe the same state. Without
            // this, a concurrent generate_diff call between the two awaits
            // could replace the slot and silently bypass the budget check.
            const ctx: ToolExecutionContext = { diffSlot: getDiff() };

            await reportProgressStepUpdate(
              reportProgress,
              config.name,
              progressContext,
              0,
              'starting'
            );

            if (config.validateInput) {
              const validationError = await config.validateInput(
                inputRecord,
                ctx
              );
              if (validationError) {
                const validationMessage =
                  validationError.structuredContent.error?.message ??
                  INPUT_VALIDATION_FAILED;
                await updateStatusMessage(validationMessage);
                await reportProgressCompletionUpdate(
                  reportProgress,
                  config.name,
                  progressContext,
                  'rejected',
                  false
                );
                await storeResultSafely('completed', validationError);
                return;
              }
            }

            await reportProgressStepUpdate(
              reportProgress,
              config.name,
              progressContext,
              1,
              'preparing'
            );

            const promptParts = config.buildPrompt(inputRecord, ctx);
            const { prompt } = promptParts;
            const { systemInstruction } = promptParts;

            const modelLabel = friendlyModelName(config.model);
            await reportProgressStepUpdate(
              reportProgress,
              config.name,
              progressContext,
              2,
              modelLabel
            );

            let parsed: TResult | undefined;
            let retryPrompt = prompt;

            for (let attempt = 0; attempt <= MAX_SCHEMA_RETRIES; attempt += 1) {
              try {
                const raw = await generateStructuredJson(
                  createGenerationRequest(
                    config,
                    { systemInstruction, prompt: retryPrompt },
                    responseSchema,
                    onLog,
                    extra.signal
                  )
                );

                if (attempt === 0) {
                  await reportProgressStepUpdate(
                    reportProgress,
                    config.name,
                    progressContext,
                    3,
                    'processing response'
                  );
                }

                parsed = config.resultSchema.parse(raw);
                break;
              } catch (error: unknown) {
                if (
                  attempt >= MAX_SCHEMA_RETRIES ||
                  !(error instanceof z.ZodError)
                ) {
                  throw error;
                }

                const errorMessage = getErrorMessage(error);
                await onLog('warning', {
                  event: 'schema_validation_failed',
                  details: { attempt, error: errorMessage },
                });

                retryPrompt = `${prompt}\n\nCRITICAL: The previous response failed schema validation. Error: ${errorMessage}`;
              }
            }

            if (!parsed) {
              throw new Error('Unexpected state: parsed result is undefined');
            }

            const finalResult = (
              config.transformResult
                ? config.transformResult(inputRecord, parsed, ctx)
                : parsed
            ) as TFinal;

            const textContent = config.formatOutput
              ? config.formatOutput(finalResult)
              : undefined;

            const outcome = config.formatOutcome?.(finalResult) ?? 'completed';
            await reportProgressCompletionUpdate(
              reportProgress,
              config.name,
              progressContext,
              outcome
            );
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
            await reportProgressCompletionUpdate(
              reportProgress,
              config.name,
              progressContext,
              'failed',
              false
            );
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
