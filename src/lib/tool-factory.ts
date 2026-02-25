import type {
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra,
} from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { RequestTaskStore } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  CallToolResult,
  LoggingLevel,
} from '@modelcontextprotocol/sdk/types.js';

import { z } from 'zod';

import { DefaultOutputSchema } from '../schemas/outputs.js';
import {
  createNoDiffError,
  type DiffSlot,
  diffStaleWarningMs,
  getDiff,
} from './diff-store.js';
import { validateDiffBudget } from './diff.js';
import { createCachedEnvInt } from './env-config.js';
import { getErrorMessage, RETRYABLE_UPSTREAM_ERROR_PATTERN } from './errors.js';
import { stripJsonSchemaConstraints } from './gemini-schema.js';
import { generateStructuredJson } from './gemini.js';
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

// Named progress step indices for 7-step progress (0–6).
const STEP_STARTING = 0;
const STEP_VALIDATING = 1;
const STEP_BUILDING_PROMPT = 2;
const STEP_CALLING_MODEL = 3;
const STEP_VALIDATING_RESPONSE = 4;
const STEP_FINALIZING = 5;
const TASK_PROGRESS_TOTAL = STEP_FINALIZING + 1;

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
const responseSchemaCache = new WeakMap<object, Record<string, unknown>>();

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

const progressReporterCache = new WeakMap<
  ProgressExtra,
  (payload: ProgressPayload) => Promise<void>
>();

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  destructiveHint?: boolean;
}

function buildToolAnnotations(
  annotations: ToolAnnotations | undefined
): ToolAnnotations {
  if (!annotations) {
    return {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    };
  }

  const annotationOverrides = { ...annotations };
  delete annotationOverrides.destructiveHint;

  return {
    readOnlyHint: !annotations.destructiveHint,
    idempotentHint: !annotations.destructiveHint,
    openWorldHint: true,
    ...annotationOverrides,
  };
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

  /** Optional MCP annotation overrides for this tool. */
  annotations?: ToolAnnotations;

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

function getCachedGeminiResponseSchema<
  TInput extends object,
  TResult extends object,
  TFinal extends TResult,
>(
  config: StructuredToolTaskConfig<TInput, TResult, TFinal>
): Record<string, unknown> {
  const cached = responseSchemaCache.get(config);
  if (cached) {
    return cached;
  }

  const responseSchema = createGeminiResponseSchema({
    geminiSchema: config.geminiSchema,
    resultSchema: config.resultSchema,
  });
  responseSchemaCache.set(config, responseSchema);
  return responseSchema;
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

function createProgressReporter(
  extra: ProgressExtra
): (payload: ProgressPayload) => Promise<void> {
  const rawToken = extra._meta?.progressToken;
  if (typeof rawToken !== 'string' && typeof rawToken !== 'number') {
    return async (): Promise<void> => {
      // Request did not provide a progress token.
    };
  }

  const progressToken = rawToken;
  let lastCurrent = -1;
  let didSendTerminal = false;

  return async (payload): Promise<void> => {
    if (didSendTerminal) {
      return;
    }

    let { current } = payload;
    if (current <= lastCurrent && current < (payload.total ?? Infinity)) {
      current = lastCurrent + 0.01;
    }
    current = Math.max(current, lastCurrent);

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

    const params: ProgressNotificationParams = {
      progressToken,
      progress: progressPayload.current,
      ...(progressPayload.total !== undefined
        ? { total: progressPayload.total }
        : {}),
      ...(progressPayload.message !== undefined
        ? { message: progressPayload.message }
        : {}),
    };

    await extra
      .sendNotification({ method: 'notifications/progress', params })
      .catch(() => {
        // Progress notifications are best-effort; never fail tool execution.
      });

    lastCurrent = current;
    if (total !== undefined && total === current) {
      didSendTerminal = true;
    }
  };
}

function getOrCreateProgressReporter(
  extra: ProgressExtra
): (payload: ProgressPayload) => Promise<void> {
  const cached = progressReporterCache.get(extra);
  if (cached) {
    return cached;
  }

  const created = createProgressReporter(extra);
  progressReporterCache.set(extra, created);
  return created;
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
  return `${toolName}: ${context} • ${metadata}`;
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

async function sendSingleStepProgress(
  extra: ProgressExtra,
  toolName: string,
  context: string,
  current: 0 | 1,
  state: 'starting' | 'completed' | 'failed' | 'cancelled'
): Promise<void> {
  const reporter = getOrCreateProgressReporter(extra);

  await reporter({
    current,
    total: 1,
    message:
      current === 0
        ? formatProgressStep(toolName, context, state)
        : formatProgressCompletion(toolName, context, state),
  });
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
      STEP_VALIDATING_RESPONSE + retryCount / (maxRetries + 1),
      `Schema repair in progress (attempt ${retryCount}/${maxRetries})...`
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
    try {
      await sendSingleStepProgress(
        extra,
        options.toolName,
        context,
        0,
        'starting'
      );
    } catch {
      // Progress is best-effort; tool execution must not fail on notification errors.
    }

    try {
      const result = await handler(input, extra);

      // End progress (1/1)
      const outcome = result.isError ? 'failed' : 'completed';
      try {
        await sendSingleStepProgress(
          extra,
          options.toolName,
          context,
          1,
          outcome
        );
      } catch {
        // Progress is best-effort; returning a successful tool result takes precedence.
      }

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const failureMeta = classifyErrorMeta(error, errorMessage);
      const outcome = failureMeta.kind === 'cancelled' ? 'cancelled' : 'failed';

      // Progress is best-effort; must never mask the original error.
      try {
        await sendSingleStepProgress(
          extra,
          options.toolName,
          context,
          1,
          outcome
        );
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

interface TaskStatusReporter {
  updateStatus: (message: string) => Promise<void>;
  storeResult?: (
    status: 'completed' | 'failed',
    result: CallToolResult
  ) => Promise<void>;
}

export class ToolExecutionRunner<
  TInput extends object,
  TResult extends object,
  TFinal extends TResult,
> {
  private diffSlotSnapshot: DiffSlot | undefined;
  private hasSnapshot = false;
  private responseSchema: Record<string, unknown>;
  private readonly onLog: (level: string, data: unknown) => Promise<void>;
  private readonly reportProgress: (payload: ProgressPayload) => Promise<void>;
  private readonly statusReporter: TaskStatusReporter;
  private progressContext: string;
  private lastStatusMessage: string | undefined;

  constructor(
    private readonly config: StructuredToolTaskConfig<TInput, TResult, TFinal>,
    dependencies: {
      onLog: (level: string, data: unknown) => Promise<void>;
      reportProgress: (payload: ProgressPayload) => Promise<void>;
      statusReporter: TaskStatusReporter;
    },
    private readonly signal?: AbortSignal
  ) {
    this.responseSchema = getCachedGeminiResponseSchema(config);
    this.reportProgress = dependencies.reportProgress;
    this.statusReporter = dependencies.statusReporter;
    this.progressContext = DEFAULT_PROGRESS_CONTEXT;

    this.onLog = async (level: string, data: unknown): Promise<void> => {
      try {
        await dependencies.onLog(level, data);
      } catch {
        // Ignore logging failures
      }
      await this.handleInternalLog(data);
    };
  }

  private async handleInternalLog(data: unknown): Promise<void> {
    const record = asObjectRecord(data);
    if (record.event === 'gemini_retry') {
      const details = asObjectRecord(record.details);
      const { attempt } = details;
      const msg = `Network error. Retrying (attempt ${String(attempt)})...`;

      await reportProgressStepUpdate(
        this.reportProgress,
        this.config.name,
        this.progressContext,
        STEP_CALLING_MODEL,
        msg
      );
      await this.updateStatusMessage(msg);
    } else if (record.event === 'gemini_queue_acquired') {
      const msg = 'Model queue acquired, generating response...';
      await reportProgressStepUpdate(
        this.reportProgress,
        this.config.name,
        this.progressContext,
        STEP_CALLING_MODEL,
        msg
      );
      await this.updateStatusMessage(msg);
    }
  }

  setResponseSchemaOverride(responseSchema: Record<string, unknown>): void {
    this.responseSchema = responseSchema;
    responseSchemaCache.set(this.config, responseSchema);
  }

  setDiffSlotSnapshot(diffSlotSnapshot: DiffSlot | undefined): void {
    this.diffSlotSnapshot = diffSlotSnapshot;
    this.hasSnapshot = true;
  }

  private async updateStatusMessage(message: string): Promise<void> {
    if (this.lastStatusMessage === message) {
      return;
    }

    try {
      await this.statusReporter.updateStatus(message);
      this.lastStatusMessage = message;
    } catch {
      // Best-effort
    }
  }

  private async storeResultSafely(
    status: 'completed' | 'failed',
    result: CallToolResult
  ): Promise<void> {
    if (!this.statusReporter.storeResult) {
      return;
    }
    try {
      await this.statusReporter.storeResult(status, result);
    } catch (storeErr: unknown) {
      await this.onLog('error', {
        event: 'store_result_failed',
        error: getErrorMessage(storeErr),
      });
    }
  }

  private async executeValidation(
    inputRecord: TInput,
    ctx: ToolExecutionContext
  ): Promise<ReturnType<typeof createErrorToolResponse> | undefined> {
    const validationError = await validateRequest(
      this.config,
      inputRecord,
      ctx
    );

    if (validationError) {
      let validationMessage = INPUT_VALIDATION_FAILED;
      try {
        const text = validationError.content[0]?.text;
        if (text) {
          const parsed = JSON.parse(text) as { error?: { message?: string } };
          if (parsed.error?.message) {
            validationMessage = parsed.error.message;
          }
        }
      } catch {
        // fallback to default
      }
      await this.updateStatusMessage(validationMessage);
      await reportProgressCompletionUpdate(
        this.reportProgress,
        this.config.name,
        this.progressContext,
        'rejected'
      );
      await this.storeResultSafely('completed', validationError);
      return validationError;
    }
    return undefined;
  }

  private async executeModelCall(
    systemInstruction: string,
    prompt: string
  ): Promise<TResult> {
    let parsed: TResult | undefined;
    let retryPrompt = prompt;
    const maxRetries =
      this.config.schemaRetries ?? geminiSchemaRetriesConfig.get();

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const raw = await generateStructuredJson(
          createGenerationRequest(
            this.config,
            { systemInstruction, prompt: retryPrompt },
            this.responseSchema,
            this.onLog,
            this.signal
          )
        );

        if (attempt === 0) {
          await this.updateStatusMessage('Verifying output structure...');
          await reportProgressStepUpdate(
            this.reportProgress,
            this.config.name,
            this.progressContext,
            STEP_VALIDATING_RESPONSE,
            'Verifying output structure...'
          );
        }

        parsed = this.config.resultSchema.parse(raw);
        break;
      } catch (error: unknown) {
        if (attempt >= maxRetries || !isRetryableSchemaError(error)) {
          throw error;
        }

        const errorMessage = getErrorMessage(error);
        const schemaRetryPrompt = createSchemaRetryPrompt(
          prompt,
          errorMessage,
          this.config.deterministicJson === true
        );
        await this.onLog('warning', {
          event: 'schema_validation_failed',
          details: {
            attempt,
            error: schemaRetryPrompt.summarizedError,
            originalChars: errorMessage.length,
          },
        });

        await reportSchemaRetryProgressBestEffort(
          this.reportProgress,
          this.config.name,
          this.progressContext,
          attempt + 1,
          maxRetries
        );

        retryPrompt = schemaRetryPrompt.prompt;
      }
    }

    if (!parsed) {
      throw new Error('Unexpected state: parsed result is undefined');
    }
    return parsed;
  }

  async run(input: unknown): Promise<CallToolResult> {
    try {
      const inputRecord = parseToolInput<TInput>(
        input,
        this.config.fullInputSchema
      );
      this.progressContext = normalizeProgressContext(
        this.config.progressContext?.(inputRecord)
      );

      const ctx: ToolExecutionContext = {
        diffSlot: this.hasSnapshot ? this.diffSlotSnapshot : getDiff(),
      };

      await reportProgressStepUpdate(
        this.reportProgress,
        this.config.name,
        this.progressContext,
        STEP_STARTING,
        'Initializing...'
      );
      await this.updateStatusMessage('Initializing...');

      await reportProgressStepUpdate(
        this.reportProgress,
        this.config.name,
        this.progressContext,
        STEP_VALIDATING,
        'Validating request parameters...'
      );
      await this.updateStatusMessage('Validating request parameters...');

      const validationError = await this.executeValidation(inputRecord, ctx);
      if (validationError) {
        return validationError;
      }

      await reportProgressStepUpdate(
        this.reportProgress,
        this.config.name,
        this.progressContext,
        STEP_BUILDING_PROMPT,
        'Constructing analysis context...'
      );
      await this.updateStatusMessage('Constructing analysis context...');

      const promptParts = this.config.buildPrompt(inputRecord, ctx);
      const { prompt, systemInstruction } = promptParts;

      await reportProgressStepUpdate(
        this.reportProgress,
        this.config.name,
        this.progressContext,
        STEP_CALLING_MODEL,
        'Querying Gemini model...'
      );
      await this.updateStatusMessage('Querying Gemini model...');

      const parsed = await this.executeModelCall(systemInstruction, prompt);

      await reportProgressStepUpdate(
        this.reportProgress,
        this.config.name,
        this.progressContext,
        STEP_FINALIZING,
        'Processing results...'
      );
      await this.updateStatusMessage('Processing results...');

      const finalResult = (
        this.config.transformResult
          ? this.config.transformResult(inputRecord, parsed, ctx)
          : parsed
      ) as TFinal;

      let textContent = this.config.formatOutput
        ? this.config.formatOutput(finalResult)
        : undefined;

      if (ctx.diffSlot) {
        const ageMs = Date.now() - new Date(ctx.diffSlot.generatedAt).getTime();
        if (ageMs > diffStaleWarningMs.get()) {
          const ageMinutes = Math.round(ageMs / 60_000);
          const warning = `\n\nWarning: The analyzed diff is over ${ageMinutes} minutes old. If you have made recent changes, please run generate_diff again.`;
          textContent = textContent ? textContent + warning : warning;
        }
      }

      const outcome = this.config.formatOutcome?.(finalResult) ?? 'completed';
      await reportProgressCompletionUpdate(
        this.reportProgress,
        this.config.name,
        this.progressContext,
        outcome
      );
      await this.updateStatusMessage(`completed: ${outcome}`);

      const successResponse = createToolResponse(
        {
          ok: true as const,
          result: finalResult,
        },
        textContent
      );
      await this.storeResultSafely('completed', successResponse);
      return successResponse;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorMeta = classifyErrorMeta(error, errorMessage);
      const outcome = errorMeta.kind === 'cancelled' ? 'cancelled' : 'failed';
      await this.updateStatusMessage(
        createFailureStatusMessage(outcome, errorMessage)
      );

      const errorResponse = createErrorToolResponse(
        this.config.errorCode,
        errorMessage,
        undefined,
        errorMeta
      );

      await this.storeResultSafely('failed', errorResponse);
      await reportProgressCompletionUpdate(
        this.reportProgress,
        this.config.name,
        this.progressContext,
        outcome
      );
      return errorResponse; // Return safe error response
    }
  }
}

interface ExtendedRequestTaskStore extends RequestTaskStore {
  updateTaskStatus(
    taskId: string,
    status: 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled',
    statusMessage?: string
  ): Promise<void>;
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
      annotations: buildToolAnnotations(config.annotations),
      execution: {
        taskSupport: 'optional',
      },
    },
    {
      createTask: async (
        input: unknown,
        extra: CreateTaskRequestHandlerExtra
      ) => {
        const task = await extra.taskStore.createTask({ ttl: 300000 });
        const extendedStore =
          extra.taskStore as unknown as ExtendedRequestTaskStore;

        const runner = new ToolExecutionRunner(config, {
          onLog: async (level, data) => {
            try {
              await server.sendLoggingMessage({
                level: toLoggingLevel(level),
                logger: 'gemini',
                data: asObjectRecord(data),
              });
            } catch {
              // Fallback if logging fails
            }
          },
          reportProgress: createProgressReporter(
            extra as unknown as ProgressExtra
          ),
          statusReporter: {
            updateStatus: async (message) => {
              await extendedStore.updateTaskStatus(
                task.taskId,
                'working',
                message
              );
            },
            storeResult: async (status, result) => {
              await extra.taskStore.storeTaskResult(
                task.taskId,
                status,
                result
              );
            },
          },
        });
        runner.setResponseSchemaOverride(responseSchema);

        // Run in background
        runner.run(input).catch(async (error: unknown) => {
          await extendedStore.updateTaskStatus(
            task.taskId,
            'failed',
            getErrorMessage(error)
          );
        });

        return { task };
      },
      getTask: async (input: unknown, extra: TaskRequestHandlerExtra) => {
        return await extra.taskStore.getTask(extra.taskId);
      },
      getTaskResult: async (input: unknown, extra: TaskRequestHandlerExtra) => {
        return (await extra.taskStore.getTaskResult(
          extra.taskId
        )) as CallToolResult;
      },
    }
  );
}
