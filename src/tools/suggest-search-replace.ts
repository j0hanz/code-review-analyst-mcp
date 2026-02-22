import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { extractChangedPathsFromFiles } from '../lib/diff-parser.js';
import { requireToolContract } from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { SuggestSearchReplaceInputSchema } from '../schemas/inputs.js';
import { SearchReplaceResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are a code remediation expert. Generate minimal search-and-replace blocks to fix exactly the described issue.
CRITICAL: 'search' must be verbatim — character-exact whitespace and indentation.
Never modify code outside the fix scope. If the target cannot be located precisely, omit the block rather than guessing.
Return strict JSON only.
`;
const TOOL_CONTRACT = requireToolContract('suggest_search_replace');

function formatPatchCount(count: number): string {
  return `${count} ${count === 1 ? 'patch' : 'patches'}`;
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
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    ...(TOOL_CONTRACT.thinkingLevel !== undefined
      ? { thinkingLevel: TOOL_CONTRACT.thinkingLevel }
      : undefined),
    ...(TOOL_CONTRACT.temperature !== undefined
      ? { temperature: TOOL_CONTRACT.temperature }
      : undefined),
    ...(TOOL_CONTRACT.deterministicJson !== undefined
      ? { deterministicJson: TOOL_CONTRACT.deterministicJson }
      : undefined),
    requiresDiff: true,
    formatOutcome: (result) => formatPatchCount(result.blocks.length),
    formatOutput: (result) => {
      const count = result.blocks.length;
      const patches = formatPatchCount(count);
      return `${result.summary}\n${patches} • Checklist: ${result.validationChecklist.join(' | ')}`;
    },
    buildPrompt: (input, ctx) => {
      const diff = ctx.diffSlot?.diff ?? '';
      const files = ctx.diffSlot?.parsedFiles ?? [];
      const paths = extractChangedPathsFromFiles(files);

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
