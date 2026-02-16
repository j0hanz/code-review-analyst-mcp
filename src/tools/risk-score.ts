import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { zodToJsonSchema } from 'zod-to-json-schema';

import { exceedsDiffBudget, getDiffBudgetError } from '../lib/diff-budget.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { generateStructuredJson } from '../lib/gemini.js';
import { createToolResponse } from '../lib/tool-response.js';
import { RiskScoreInputSchema } from '../schemas/inputs.js';
import {
  DefaultOutputSchema,
  RiskScoreResultSchema,
} from '../schemas/outputs.js';

const DEFAULT_DEPLOYMENT_CRITICALITY = 'medium';

interface RiskPromptInput {
  diff: string;
  deploymentCriticality?: 'low' | 'medium' | 'high';
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

export function buildRiskPrompt(input: RiskPromptInput): {
  systemInstruction: string;
  prompt: string;
} {
  const systemInstruction = [
    'You are assessing software deployment risk from a code diff.',
    'Return strict JSON only, no markdown fences.',
  ].join('\n');

  const prompt = [
    `Deployment criticality: ${input.deploymentCriticality ?? DEFAULT_DEPLOYMENT_CRITICALITY}`,
    'Score guidance: 0 is no risk, 100 is severe risk.',
    'Rationale must be concise, concrete, and evidence-based.',
    '',
    'Unified diff:',
    input.diff,
  ].join('\n');

  return { systemInstruction, prompt };
}

export function registerRiskScoreTool(server: McpServer): void {
  const riskScoreInputShape = RiskScoreInputSchema.shape;

  server.experimental.tasks.registerToolTask<
    typeof riskScoreInputShape,
    typeof DefaultOutputSchema
  >(
    'risk_score',
    {
      title: 'Risk Score',
      description:
        'Score a diff from 0-100 and explain the key risk drivers for release decisions.',
      inputSchema: riskScoreInputShape,
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

          await sendProgress(5, 'Starting risk_score');

          const budgetError = getDiffBudgetErrorResponse(input.diff);
          if (budgetError) {
            await extra.taskStore.storeTaskResult(
              task.taskId,
              'completed',
              budgetError
            );
            return { task };
          }

          const { systemInstruction, prompt } = buildRiskPrompt({
            diff: input.diff,
            ...(input.deploymentCriticality
              ? { deploymentCriticality: input.deploymentCriticality }
              : {}),
          });

          const responseSchema = zodToJsonSchema(
            RiskScoreResultSchema
          ) as Record<string, unknown>;

          const raw = await generateStructuredJson({
            systemInstruction,
            prompt,
            responseSchema,
            onProgress: async (update) => {
              await sendProgress(
                update.progress,
                update.message ?? 'risk_score in progress'
              );
            },
          });
          const parsed = RiskScoreResultSchema.parse(raw);

          await sendProgress(100, 'Completed risk_score');

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
            createErrorResponse('E_RISK_SCORE', getErrorMessage(error))
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
