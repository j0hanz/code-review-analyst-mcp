import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

import {
  getToolContract,
  getToolContractNames,
} from '../lib/tool-contracts.js';

const HELP_PROMPT_NAME = 'get-help';
const HELP_PROMPT_TITLE = 'Get Help';
const HELP_PROMPT_DESCRIPTION = 'Server instructions.';

const REVIEW_GUIDE_PROMPT_NAME = 'review-guide';
const REVIEW_GUIDE_PROMPT_TITLE = 'Review Guide';
const REVIEW_GUIDE_PROMPT_DESCRIPTION = 'Workflow guide for tool/focus area.';

const TOOLS = getToolContractNames();

const FOCUS_AREAS = [
  'security',
  'correctness',
  'performance',
  'regressions',
  'tests',
] as const;
type FocusArea = (typeof FOCUS_AREAS)[number];
const TOOL_DESCRIPTION_TEXT = 'Select tool for review guide.';
const FOCUS_DESCRIPTION_TEXT = 'Select focus area.';

const FOCUS_AREA_GUIDES: Record<FocusArea, string> = {
  security: 'Focus: Injection, auth, crypto, OWASP.',
  correctness: 'Focus: Logic, edge cases, algorithms, contracts.',
  performance: 'Focus: Complexity, allocations, I/O, queries.',
  regressions: 'Focus: Behavior changes, guards, types, breaks.',
  tests: 'Focus: Coverage, edge cases, flakes, error paths.',
};

function completeByPrefix<T extends string>(
  values: readonly T[],
  prefix: string
): T[] {
  const matches: T[] = [];
  for (const value of values) {
    if (value.startsWith(prefix)) {
      matches.push(value);
    }
  }
  return matches;
}

function getGuide<T extends string>(
  guides: Record<T, string>,
  value: string,
  fallback: (value: string) => string
): string {
  const guide = (guides as Record<string, string>)[value];
  return guide ?? fallback(value);
}

function getToolGuide(tool: string): string {
  const contract = getToolContract(tool);
  if (!contract) {
    return `Use \`${tool}\` to analyze your code changes.`;
  }

  const { thinkingBudget } = contract;
  const modelLine =
    thinkingBudget !== undefined
      ? `Model: ${contract.model} (thinking budget ${thinkingBudget}, output cap ${contract.maxOutputTokens}).`
      : `Model: ${contract.model} (output cap ${contract.maxOutputTokens}).`;
  return `Tool: ${contract.name}\n${modelLine}\nOutput: ${contract.outputShape}\nUse: ${contract.purpose}`;
}

function getFocusAreaGuide(focusArea: string): string {
  return getGuide(
    FOCUS_AREA_GUIDES,
    focusArea,
    (area) => `Focus on ${area} concerns.`
  );
}

function registerHelpPrompt(server: McpServer, instructions: string): void {
  server.registerPrompt(
    HELP_PROMPT_NAME,
    {
      title: HELP_PROMPT_TITLE,
      description: HELP_PROMPT_DESCRIPTION,
    },
    () => ({
      description: HELP_PROMPT_DESCRIPTION,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: instructions,
          },
        },
      ],
    })
  );
}

function buildReviewGuideText(tool: string, focusArea: string): string {
  return (
    `# Code Review Guide\n\n` +
    `## Tool: \`${tool}\`\n${getToolGuide(tool)}\n\n` +
    `## Focus Area: ${focusArea}\n${getFocusAreaGuide(focusArea)}\n\n` +
    `## Example: Finding → Patch\n\n` +
    `Given a finding from \`inspect_code_quality\`:\n` +
    `- **title:** "Uncaught promise rejection in retry loop"\n` +
    `- **details:** "The catch block swallows errors without logging."\n\n` +
    `Call \`suggest_search_replace\` with those values. It returns:\n` +
    '```\n' +
    `blocks[0].search: "  } catch {\\n  }"\n` +
    `blocks[0].replace: "  } catch (err) {\\n    logger.error(err);\\n  }"\n` +
    '```\n\n' +
    `Validate that \`blocks[].search\` matches file content verbatim before applying.\n\n` +
    `> Tip: Run \`get-help\` for full server documentation.`
  );
}

function registerReviewGuidePrompt(server: McpServer): void {
  server.registerPrompt(
    REVIEW_GUIDE_PROMPT_NAME,
    {
      title: REVIEW_GUIDE_PROMPT_TITLE,
      description: REVIEW_GUIDE_PROMPT_DESCRIPTION,
      argsSchema: {
        tool: completable(z.string().describe(TOOL_DESCRIPTION_TEXT), (value) =>
          completeByPrefix(TOOLS, value)
        ),
        focusArea: completable(
          z.string().describe(FOCUS_DESCRIPTION_TEXT),
          (value) => completeByPrefix(FOCUS_AREAS, value)
        ),
      },
    },
    ({ tool, focusArea }) => ({
      description: `Code review guide: ${tool} / ${focusArea}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: buildReviewGuideText(tool, focusArea),
          },
        },
      ],
    })
  );
}

export function registerAllPrompts(
  server: McpServer,
  instructions: string
): void {
  registerHelpPrompt(server, instructions);
  registerReviewGuidePrompt(server);
}
