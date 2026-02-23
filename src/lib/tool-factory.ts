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
import { validateDiffBudget } from './diff-budget.js';
import { createNoDiffError, type DiffSlot, getDiff } from './diff-store.js';
import { createCachedEnvInt } from './env-config.js';
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
const DEFAULT_SCHEMA_RETRIES = 1;
const geminiSchemaRetriesConfig = createCachedEnvInt(
  'GEMINI_SCHEMA_RETRIES',
  DEFAULT_SCHEMA_RETRIES
);
const DEFAULT_SCHEMA_RETRY_ERROR_CHARS = 1_500;
const schemaRetryErrorCharsConfig = createCachedEnvInt(
  'MAX_SCHEMA_RETRY_ERROR_CHARS',
  DEFAULT_SCHEMA_RETRY_ERROR_CHARS
);
const DETERMINISTIC_JSON_RETRY_NOTE =
  'Deterministic JSON mode: keep key names exactly as schema-defined and preserve stable field ordering.';

const JSON_PARSE_ERROR_PATTERN = /model produced invalid json/i;

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

  /** Optional flag to enforce diff presence and budget check before tool execution. */
  requiresDiff?: boolean;

  /** Optional override for schema validation retries. Defaults to GEMINI_SCHEMA_RETRIES env var. */
  schemaRetries?: number;

  /** Optional Gemini model to use (e.g. 'gemini-3-pro-preview'). */
  model?: string;

  /** Optional thinking level. */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';

  /** Optional timeout in ms for the Gemini call. Defaults to 90,000 ms. Use DEFAULT_TIMEOUT_PRO_MS for Pro model calls. */
  timeoutMs?: number;

  /** Optional max output tokens for Gemini. */
  maxOutputTokens?: number;

  /**
   * Optional sampling temperature for this tool's Gemini call.
   * Gemini 3 recommends 1.0 for all tasks.
   */
  temperature?: number;

  /** Optional opt-in to Gemini thought output. Defaults to false. */
  includeThoughts?: boolean;

  /** Optional deterministic JSON mode for stricter key ordering and repair prompting. */
  deterministicJson?: boolean;

  /** Optional batch execution mode. Defaults to runtime setting. */
  batchMode?: 'off' | 'inline';

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

function extractResponseKeyOrdering(
  responseSchema: Readonly<Record<string, unknown>>
): readonly string[] | undefined {
  const schemaType = responseSchema.type;
  if (schemaType !== 'object') {
    return undefined;
  }

  const { properties } = responseSchema;
  if (typeof properties !== 'object' || properties === null) {
    return undefined;
  }

  return Object.keys(properties as Record<string, unknown>);
}

export function summarizeSchemaValidationErrorForRetry(
  errorMessage: string
): string {
  const maxChars = Math.max(200, schemaRetryErrorCharsConfig.get());
  const compact = errorMessage.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) {
    return compact;
  }

  return `${compact.slice(0, maxChars - 3)}...`;
}

function createSchemaRetryPrompt(
  prompt: string,
  errorMessage: string,
  deterministicJson: boolean
): { prompt: string; summarizedError: string } {
  const summarizedError = summarizeSchemaValidationErrorForRetry(errorMessage);
  const deterministicNote = deterministicJson
    ? `\n${DETERMINISTIC_JSON_RETRY_NOTE}`
    : '';

  return {
    summarizedError,
    prompt: `${prompt}\n\nCRITICAL: The previous response failed schema validation. Error: ${summarizedError}${deterministicNote}`,
  };
}

function isRetryableSchemaError(error: unknown): boolean {
  const isZodError = error instanceof z.ZodError;
  return isZodError || JSON_PARSE_ERROR_PATTERN.test(getErrorMessage(error));
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
  if (config.thinkingLevel !== undefined) {
    request.thinkingLevel = config.thinkingLevel;
  }
  if (config.timeoutMs !== undefined) {
    request.timeoutMs = config.timeoutMs;
  }
  if (config.maxOutputTokens !== undefined) {
    request.maxOutputTokens = config.maxOutputTokens;
  }
  if (config.temperature !== undefined) {
    request.temperature = config.temperature;
  }
  if (config.includeThoughts !== undefined) {
    request.includeThoughts = config.includeThoughts;
  }
  if (config.deterministicJson) {
    const responseKeyOrdering = extractResponseKeyOrdering(responseSchema);
    if (responseKeyOrdering !== undefined) {
      request.responseKeyOrdering = responseKeyOrdering;
    }
  }
  if (config.batchMode !== undefined) {
    request.batchMode = config.batchMode;
  }
  if (signal !== undefined) {
    request.signal = signal;
  }

  return request;
}

const VALIDATION_ERROR_PATTERN = /validation/i;

function classifyErrorMeta(error: unknown, message: string): ErrorMeta {
  if (error instanceof z.ZodError || VALIDATION_ERROR_PATTERN.test(message)) {
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

function sendTaskProgress(
  extra: ProgressExtra,
  payload: ProgressPayload
): Promise<void> {
  const rawToken = extra._meta?.progressToken;
  if (typeof rawToken !== 'string' && typeof rawToken !== 'number') {
    return Promise.resolve();
  }
  const params: ProgressNotificationParams = {
    progressToken: rawToken,
    progress: payload.current,
    ...(payload.total !== undefined ? { total: payload.total } : {}),
    ...(payload.message !== undefined ? { message: payload.message } : {}),
  };
  return extra
    .sendNotification({ method: 'notifications/progress', params })
    .catch(() => {
      // Progress notifications are best-effort; never fail tool execution.
    });
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
  return `${toolName}: ${context} [${metadata}]`;
}

function friendlyModelName(model: string | undefined): string {
  if (!model) return 'calling model';
  const normalized = model.toLowerCase();
  if (normalized.includes('pro')) return 'calling Pro';
  if (normalized.includes('flash')) return 'calling Flash';
  return 'calling model';
}

function formatProgressCompletion(
  toolName: string,
  context: string,
  outcome: string
): string {
  return `🗒 ${toolName}: ${context} • ${outcome}`;
}

function createFailureStatusMessage(
  outcome: 'failed' | 'cancelled',
  errorMessage: string
): string {
  if (outcome === 'cancelled') {
    return `cancelled: ${errorMessage}`;
  }

  return errorMessage;
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
  outcome: string
): Promise<void> {
  await reportProgress({
    current: TASK_PROGRESS_TOTAL,
    total: TASK_PROGRESS_TOTAL,
    message: formatProgressCompletion(toolName, context, outcome),
  });
}

async function reportSchemaRetryProgressBestEffort(
  reportProgress: (payload: ProgressPayload) => Promise<void>,
  toolName: string,
  context: string,
  retryCount: number,
  maxRetries: number
): Promise<void> {
  try {
    await reportProgressStepUpdate(
      reportProgress,
      toolName,
      context,
      3,
      `repairing schema retry ${retryCount}/${maxRetries}`
    );
  } catch {
    // Progress updates are best-effort and must not interrupt retries.
  }
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

      await sendTaskProgress(extra, {
        current: 1,
        total: 1,
        message: formatProgressCompletion(options.toolName, context, outcome),
      });

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const failureMeta = classifyErrorMeta(error, errorMessage);
      const outcome = failureMeta.kind === 'cancelled' ? 'cancelled' : 'failed';

      // Progress is best-effort; must never mask the original error.
      try {
        await sendTaskProgress(extra, {
          current: 1,
          total: 1,
          message: formatProgressCompletion(options.toolName, context, outcome),
        });
      } catch {
        // Swallow progress delivery errors so the original error propagates.
      }
      throw error;
    }
  };
}

async function validateRequest<
  TInput extends object,
  TResult extends object,
  TFinal extends TResult,
>(
  config: StructuredToolTaskConfig<TInput, TResult, TFinal>,
  inputRecord: TInput,
  ctx: ToolExecutionContext
): Promise<ReturnType<typeof createErrorToolResponse> | undefined> {
  if (config.requiresDiff) {
    if (!ctx.diffSlot) {
      return createNoDiffError();
    }

    const budgetError = validateDiffBudget(ctx.diffSlot.diff);
    if (budgetError) {
      return budgetError;
    }
  }

  if (config.validateInput) {
    return await config.validateInput(inputRecord, ctx);
  }

  return undefined;
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

          const onLog = createGeminiLogger(server, task.taskId);

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
            } catch (storeErr: unknown) {
              await onLog('error', {
                event: 'store_result_failed',
                error: getErrorMessage(storeErr),
              });
            }
          };

          try {
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

            const validationError = await validateRequest(
              config,
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
                'rejected'
              );
              await storeResultSafely('completed', validationError);
              return;
            }

            await reportProgressStepUpdate(
              reportProgress,
              config.name,
              progressContext,
              1,
              'building prompt'
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
            const maxRetries =
              config.schemaRetries ?? geminiSchemaRetriesConfig.get();

            for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
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
                    'validating response'
                  );
                }

                parsed = config.resultSchema.parse(raw);
                break;
              } catch (error: unknown) {
                // Trigger schema repair for Zod validation failures and for
                // invalid-JSON responses (parseStructuredResponse throws a
                // plain Error when the model produces unparseable JSON).
                if (attempt >= maxRetries || !isRetryableSchemaError(error)) {
                  throw error;
                }

                const errorMessage = getErrorMessage(error);
                const schemaRetryPrompt = createSchemaRetryPrompt(
                  prompt,
                  errorMessage,
                  config.deterministicJson === true
                );
                await onLog('warning', {
                  event: 'schema_validation_failed',
                  details: {
                    attempt,
                    error: schemaRetryPrompt.summarizedError,
                    originalChars: errorMessage.length,
                  },
                });

                const retryCount = attempt + 1;
                await reportSchemaRetryProgressBestEffort(
                  reportProgress,
                  config.name,
                  progressContext,
                  retryCount,
                  maxRetries
                );

                retryPrompt = schemaRetryPrompt.prompt;
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
            const outcome =
              errorMeta.kind === 'cancelled' ? 'cancelled' : 'failed';
            await updateStatusMessage(
              createFailureStatusMessage(outcome, errorMessage)
            );
            await storeResultSafely(
              'failed',
              createErrorToolResponse(
                config.errorCode,
                errorMessage,
                undefined,
                errorMeta
              )
            );
            await reportProgressCompletionUpdate(
              reportProgress,
              config.name,
              progressContext,
              outcome
            );
          }
        };

        setImmediate(() => {
          void runTask().catch(async (error: unknown) => {
            try {
              await server.sendLoggingMessage({
                level: 'error',
                logger: 'task-runner',
                data: { task: config.name, error: getErrorMessage(error) },
              });
            } catch {
              console.error(
                `[task-runner:${config.name}] ${getErrorMessage(error)}`
              );
            }
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
