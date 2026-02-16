import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { zodToJsonSchema } from 'zod-to-json-schema';

import { exceedsDiffBudget, getDiffBudgetError } from '../lib/diff-budget.js';
import { getErrorMessage } from '../lib/errors.js';
import { generateStructuredJson } from '../lib/gemini.js';
import {
  createErrorToolResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { ReviewDiffInputSchema } from '../schemas/inputs.js';
import {
  DefaultOutputSchema,
  ReviewDiffResultSchema,
} from '../schemas/outputs.js';

const DEFAULT_MAX_FINDINGS = 10;
const DEFAULT_FOCUS_AREAS = 'security, correctness, regressions, performance';

interface ReviewPromptInput {
  repository: string;
  language?: string;
  focusAreas?: string[];
  maxFindings: number;
  diff: string;
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

function buildReviewPrompt(input: ReviewPromptInput): {
  systemInstruction: string;
  prompt: string;
} {
  const focus = input.focusAreas?.length
    ? input.focusAreas.join(', ')
    : DEFAULT_FOCUS_AREAS;

  const systemInstruction = [
    'You are a senior staff engineer performing pull request review.',
    'Return strict JSON only with no markdown fences.',
  ].join('\n');

  const prompt = [
    `Repository: ${input.repository}`,
    `Primary language: ${input.language ?? 'not specified'}`,
    `Focus areas: ${focus}`,
    `Limit findings to ${input.maxFindings}.`,
    'Prioritize concrete, high-confidence defects and risky behavior changes.',
    'Include testsNeeded as short action items.',
    '',
    'Unified diff:',
    input.diff,
  ].join('\n');

  return { systemInstruction, prompt };
}

export function registerReviewDiffTool(server: McpServer): void {
  const reviewDiffInputShape = ReviewDiffInputSchema.shape;

  server.experimental.tasks.registerToolTask<
    typeof reviewDiffInputShape,
    typeof DefaultOutputSchema
  >(
    'review_diff',
    {
      title: 'Review Diff',
      description:
        'Analyze a code diff and return structured findings, risk level, and test recommendations.',
      inputSchema: reviewDiffInputShape,
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

          await sendProgress(5, 'Starting review_diff');

          const budgetError = getDiffBudgetErrorResponse(input.diff);
          if (budgetError) {
            await extra.taskStore.storeTaskResult(
              task.taskId,
              'completed',
              budgetError
            );
            return { task };
          }

          const maxFindings = input.maxFindings ?? DEFAULT_MAX_FINDINGS;
          const { systemInstruction, prompt } = buildReviewPrompt({
            repository: input.repository,
            ...(input.language ? { language: input.language } : {}),
            ...(input.focusAreas ? { focusAreas: input.focusAreas } : {}),
            maxFindings,
            diff: input.diff,
          });

          const responseSchema = zodToJsonSchema(
            ReviewDiffResultSchema
          ) as Record<string, unknown>;

          const raw = await generateStructuredJson({
            systemInstruction,
            prompt,
            responseSchema,
            onProgress: async (update) => {
              await sendProgress(
                update.progress,
                update.message ?? 'review_diff in progress'
              );
            },
          });
          const parsed = ReviewDiffResultSchema.parse(raw);

          await sendProgress(100, 'Completed review_diff');

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
            createErrorToolResponse('E_REVIEW_DIFF', getErrorMessage(error))
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
