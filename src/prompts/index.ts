import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

const HELP_PROMPT_NAME = 'get-help';
const HELP_PROMPT_TITLE = 'Get Help';
const HELP_PROMPT_DESCRIPTION = 'Return the server usage instructions.';

const REVIEW_GUIDE_PROMPT_NAME = 'review-guide';
const REVIEW_GUIDE_PROMPT_TITLE = 'Review Guide';
const REVIEW_GUIDE_PROMPT_DESCRIPTION =
  'Guided workflow instructions for a specific code review tool and focus area.';

const TOOLS = [
  'analyze_pr_impact',
  'generate_review_summary',
  'inspect_code_quality',
  'suggest_search_replace',
  'generate_test_plan',
] as const;
type ToolName = (typeof TOOLS)[number];

const FOCUS_AREAS = [
  'security',
  'correctness',
  'performance',
  'regressions',
  'tests',
] as const;
type FocusArea = (typeof FOCUS_AREAS)[number];
const TOOL_DESCRIPTION_TEXT =
  'Which review tool to use: analyze_pr_impact, generate_review_summary, etc.';
const FOCUS_DESCRIPTION_TEXT =
  'Focus area: security, correctness, performance, regressions, or tests';

const TOOL_GUIDES: Record<ToolName, string> = {
  analyze_pr_impact:
    'Call `analyze_pr_impact` with `diff` and `repository`. ' +
    'Get severity rating and categorization.',
  generate_review_summary:
    'Call `generate_review_summary` for a concise digest and merge recommendation.',
  inspect_code_quality:
    'Call `inspect_code_quality` for deep review with optional file context. ' +
    'Uses thinking model for complex reasoning.',
  suggest_search_replace:
    'Call `suggest_search_replace` to generate verbatim search/replace fixes.',
  generate_test_plan:
    'Call `generate_test_plan` to create a verification strategy.',
};

const FOCUS_AREA_GUIDES: Record<FocusArea, string> = {
  security:
    'Audit for injection vulnerabilities, insecure data handling, broken authentication, ' +
    'cryptographic failures, and OWASP Top 10 issues.',
  correctness:
    'Check for logic errors, edge case mishandling, incorrect algorithm implementations, ' +
    'and API contract violations.',
  performance:
    'Identify algorithmic complexity issues, unnecessary allocations, blocking I/O, ' +
    'and database query inefficiencies.',
  regressions:
    'Look for changes that could break existing behavior, removed guards, altered return types, ' +
    'or contract changes in public APIs.',
  tests:
    'Assess test coverage gaps, missing edge case tests, flaky test patterns, ' +
    'and untested error paths.',
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
  return getGuide(
    TOOL_GUIDES,
    tool,
    (toolName) => `Use \`${toolName}\` to analyze your code changes.`
  );
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
