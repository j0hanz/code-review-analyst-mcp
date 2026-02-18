import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

const HELP_PROMPT_NAME = 'get-help';
const HELP_PROMPT_DESCRIPTION = 'Return the server usage instructions.';

const REVIEW_GUIDE_PROMPT_NAME = 'review-guide';
const REVIEW_GUIDE_PROMPT_DESCRIPTION =
  'Guided workflow instructions for a specific code review tool and focus area.';

const TOOLS = ['review_diff', 'risk_score', 'suggest_patch'] as const;

const FOCUS_AREAS = [
  'security',
  'correctness',
  'performance',
  'regressions',
  'tests',
] as const;

const TOOL_GUIDES: Record<string, string> = {
  review_diff:
    'Call `review_diff` with `diff` (unified diff text) and `repository` (org/repo). ' +
    'Optional: `focusAreas` array and `maxFindings` cap. ' +
    'Returns structured findings, overallRisk, and test recommendations.',
  risk_score:
    'Call `risk_score` with `diff`. Optional: `deploymentCriticality` (low, medium, high). ' +
    'Returns a 0–100 score, bucket, and rationale for release gating.',
  suggest_patch:
    'First call `review_diff` to get findings. Then call `suggest_patch` with `diff`, ' +
    '`findingTitle`, and `findingDetails` from one finding. ' +
    'Optional: `patchStyle` (minimal, balanced, defensive). One finding per call.',
};

const FOCUS_AREA_GUIDES: Record<string, string> = {
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

function getToolGuide(tool: string): string {
  return TOOL_GUIDES[tool] ?? `Use \`${tool}\` to analyze your code changes.`;
}

function getFocusAreaGuide(focusArea: string): string {
  return FOCUS_AREA_GUIDES[focusArea] ?? `Focus on ${focusArea} concerns.`;
}

export function registerAllPrompts(
  server: McpServer,
  instructions: string
): void {
  server.registerPrompt(
    HELP_PROMPT_NAME,
    {
      title: 'Get Help',
      description: 'Return the server usage instructions.',
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

  server.registerPrompt(
    REVIEW_GUIDE_PROMPT_NAME,
    {
      title: 'Review Guide',
      description: REVIEW_GUIDE_PROMPT_DESCRIPTION,
      argsSchema: {
        tool: completable(
          z
            .string()
            .describe(
              'Which review tool to use: review_diff, risk_score, or suggest_patch'
            ),
          (value) => TOOLS.filter((t) => t.startsWith(value))
        ),
        focusArea: completable(
          z
            .string()
            .describe(
              'Focus area: security, correctness, performance, regressions, or tests'
            ),
          (value) => FOCUS_AREAS.filter((f) => f.startsWith(value))
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
            text:
              `# Code Review Guide\n\n` +
              `## Tool: \`${tool}\`\n${getToolGuide(tool)}\n\n` +
              `## Focus Area: ${focusArea}\n${getFocusAreaGuide(focusArea)}\n\n` +
              `> Tip: Run \`get-help\` for full server documentation.`,
          },
        },
      ],
    })
  );
}
