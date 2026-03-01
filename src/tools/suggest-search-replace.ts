import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { extractChangedPathsFromFiles } from '../lib/diff.js';
import { formatCountLabel } from '../lib/format.js';
import { getDiffContextSnapshot } from '../lib/tools.js';
import {
  buildStructuredToolExecutionOptions,
  requireToolContract,
} from '../lib/tools.js';
import { registerStructuredToolTask } from '../lib/tools.js';
import { SuggestSearchReplaceInputSchema } from '../schemas/inputs.js';
import { SearchReplaceResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
<role>
Code Remediation Expert.
You are a precise tool for generating automated code fixes.
</role>

<task>
Generate minimal search-and-replace blocks to fix the described issue:
- 'search' block must match the existing code EXACTLY (including whitespace).
- 'replace' block must be syntactically correct and follow local style.
</task>

<constraints>
- Verbatim match required: preserve all indentation and newlines in 'search'.
- Do not include surrounding code unless necessary for uniqueness.
- If exact match is ambiguous, return an empty block list.
- Return valid JSON matching the schema.
</constraints>
`;
const TOOL_CONTRACT = requireToolContract('suggest_search_replace');

function formatPatchCount(count: number): string {
  return formatCountLabel(count, 'patch', 'patches');
}

export function registerSuggestSearchReplaceTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'suggest_search_replace',
    title: 'Suggest Search & Replace',
    description:
      'Generate fix patches. Prerequisite: inspect_code_quality findings. Pass verbatim finding title/details.',
    inputSchema: SuggestSearchReplaceInputSchema,
    fullInputSchema: SuggestSearchReplaceInputSchema,
    resultSchema: SearchReplaceResultSchema,
    errorCode: 'E_SUGGEST_SEARCH_REPLACE',
    ...buildStructuredToolExecutionOptions(TOOL_CONTRACT),
    requiresDiff: true,
    progressContext: (input) => input.findingTitle,
    formatOutcome: (result) => formatPatchCount(result.blocks.length),
    formatOutput: (result) => {
      const count = result.blocks.length;
      const patches = formatPatchCount(count);
      return `${result.summary}\n${patches} • ${result.validationChecklist.join(' | ')}`;
    },
    buildPrompt: (input, ctx) => {
      const { diff, parsedFiles } = getDiffContextSnapshot(ctx);
      const paths = extractChangedPathsFromFiles(parsedFiles);

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `
Finding: ${input.findingTitle}
Details: ${input.findingDetails}
Changed Files: ${paths.join(', ')}

Diff:
${diff}

Based on the diff and finding details above, generate minimal search-and-replace blocks to fix the issue.
`,
      };
    },
  });
}
