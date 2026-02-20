import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

const HELP_PROMPT_NAME = 'get-help';
const HELP_PROMPT_TITLE = 'Get Help';
const HELP_PROMPT_DESCRIPTION = 'Server instructions.';

const REVIEW_GUIDE_PROMPT_NAME = 'review-guide';
const REVIEW_GUIDE_PROMPT_TITLE = 'Review Guide';
const REVIEW_GUIDE_PROMPT_DESCRIPTION = 'Workflow guide for tool/focus area.';

const TOOLS = [
  'analyze_pr_impact',
  'generate_review_summary',
  'inspect_code_quality',
  'suggest_search_replace',
  'generate_test_plan',
  'analyze_time_space_complexity',
  'detect_api_breaking_changes',
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
const TOOL_DESCRIPTION_TEXT = 'Select tool for review guide.';
const FOCUS_DESCRIPTION_TEXT = 'Select focus area.';

const TOOL_GUIDES: Record<ToolName, string> = {
  analyze_pr_impact:
    'Tool: analyze_pr_impact\n' +
    'Model: Flash. Output: severity, categories, breakingChanges, rollbackComplexity.\n' +
    'Use: Triage, breaking change check.',
  generate_review_summary:
    'Tool: generate_review_summary\n' +
    'Model: Flash. Output: summary, risk, recommendations, stats.\n' +
    'Use: Triage, merge gate.',
  inspect_code_quality:
    'Tool: inspect_code_quality\n' +
    'Model: Pro (Thinking). Output: findings, testsNeeded, overallRisk.\n' +
    'Use: Deep review. Feed findings to suggest_search_replace.',
  suggest_search_replace:
    'Tool: suggest_search_replace\n' +
    'Model: Pro (Thinking). Output: patch blocks.\n' +
    'Use: Fix generation. One finding per call. Verbatim match required.',
  generate_test_plan:
    'Tool: generate_test_plan\n' +
    'Model: Flash. Output: test cases (pseudoCode), priority.\n' +
    'Use: Test planning. Finding-aware targeting.',
  analyze_time_space_complexity:
    'Tool: analyze_time_space_complexity\n' +
    'Model: Flash. Output: time/space complexity, degradation check.\n' +
    'Use: Algorithm audit.',
  detect_api_breaking_changes:
    'Tool: detect_api_breaking_changes\n' +
    'Model: Flash. Output: breaking changes list, mitigation.\n' +
    'Use: API check before merge.',
};

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
