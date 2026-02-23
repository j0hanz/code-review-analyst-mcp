import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

import {
  getToolContract,
  getToolContractNames,
  INSPECTION_FOCUS_AREAS,
} from '../lib/tool-contracts.js';

export const PROMPT_DEFINITIONS = [
  {
    name: 'get-help',
    title: 'Get Help',
    description: 'Server instructions.',
  },
  {
    name: 'review-guide',
    title: 'Review Guide',
    description: 'Workflow guide for tool/focus area.',
  },
] as const;

const TOOLS = getToolContractNames();

type FocusArea = (typeof INSPECTION_FOCUS_AREAS)[number];
const TOOL_DESCRIPTION_TEXT = 'Select tool for review guide.';
const FOCUS_DESCRIPTION_TEXT = 'Select focus area.';

const FOCUS_AREA_GUIDES: Record<FocusArea, string> = {
  security: 'Focus: Injection (SQL/XSS), auth, crypto, OWASP Top 10.',
  correctness:
    'Focus: Logic errors, edge cases, algorithm validity, type safety.',
  performance:
    'Focus: Big-O complexity, memory allocations, I/O latency, N+1 queries.',
  regressions: 'Focus: Behavior changes, missing guards, breaking API changes.',
  tests: 'Focus: Missing coverage, flaky tests, error paths.',
  maintainability:
    'Focus: Code complexity, readability, DRY violations, patterns.',
  concurrency: 'Focus: Race conditions, deadlocks, lack of atomicity.',
};

function isFocusArea(value: string): value is FocusArea {
  return INSPECTION_FOCUS_AREAS.includes(value as FocusArea);
}

function completeByPrefix<T extends string>(
  values: readonly T[],
  prefix: string
): T[] {
  return values.filter((value) => value.startsWith(prefix));
}

function getToolGuide(tool: string): string {
  const contract = getToolContract(tool);
  if (!contract) {
    return `Use \`${tool}\` to analyze your code changes.`;
  }

  const { thinkingLevel } = contract;
  const modelLine =
    thinkingLevel !== undefined
      ? `Model: ${contract.model} (thinking level ${thinkingLevel}, output cap ${contract.maxOutputTokens}).`
      : `Model: ${contract.model} (output cap ${contract.maxOutputTokens}).`;
  return `Tool: ${contract.name}\n${modelLine}\nOutput: ${contract.outputShape}\nUse: ${contract.purpose}`;
}

function getFocusAreaGuide(focusArea: string): string {
  return isFocusArea(focusArea)
    ? FOCUS_AREA_GUIDES[focusArea]
    : `Focus on ${focusArea} concerns.`;
}

function registerHelpPrompt(server: McpServer, instructions: string): void {
  const def = PROMPT_DEFINITIONS[0];
  server.registerPrompt(
    def.name,
    {
      title: def.title,
      description: def.description,
    },
    () => ({
      description: def.description,
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
    `# Guide: ${tool} / ${focusArea}\n\n` +
    `## Tool: \`${tool}\`\n${getToolGuide(tool)}\n\n` +
    `## Focus: ${focusArea}\n${getFocusAreaGuide(focusArea)}\n\n` +
    `## Example Fix\n` +
    `Finding: "Uncaught promise rejection"\n` +
    `Call \`suggest_search_replace\`:\n` +
    '```\n' +
    `search: "  } catch {\\n  }"\n` +
    `replace: "  } catch (err) {\\n    logger.error(err);\\n  }"\n` +
    '```\n' +
    `Validate verbatim match.`
  );
}

function registerReviewGuidePrompt(server: McpServer): void {
  const def = PROMPT_DEFINITIONS[1];
  server.registerPrompt(
    def.name,
    {
      title: def.title,
      description: def.description,
      argsSchema: {
        tool: completable(z.string().describe(TOOL_DESCRIPTION_TEXT), (value) =>
          completeByPrefix(TOOLS, value)
        ),
        focusArea: completable(
          z.string().describe(FOCUS_DESCRIPTION_TEXT),
          (value) => completeByPrefix(INSPECTION_FOCUS_AREAS, value)
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
