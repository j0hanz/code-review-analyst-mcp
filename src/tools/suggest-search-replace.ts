import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  extractChangedPathsFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { createNoDiffError, getDiff } from '../lib/diff-store.js';
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
      'Generate search-and-replace blocks to fix a finding from the cached diff. Call generate_diff first.',
    inputSchema: SuggestSearchReplaceInputSchema,
    fullInputSchema: SuggestSearchReplaceInputSchema,
    resultSchema: SearchReplaceResultSchema,
    errorCode: 'E_SUGGEST_SEARCH_REPLACE',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    ...(TOOL_CONTRACT.thinkingBudget !== undefined
      ? { thinkingBudget: TOOL_CONTRACT.thinkingBudget }
      : undefined),
    validateInput: () => {
      const slot = getDiff();
      if (!slot) return createNoDiffError();
      return validateDiffBudget(slot.diff);
    },
    formatOutcome: (result) => formatPatchCount(result.blocks.length),
    formatOutput: (result) => {
      const count = result.blocks.length;
      const patches = formatPatchCount(count);
      return `${result.summary}\n${patches} • Checklist: ${result.validationChecklist.join(' | ')}`;
    },
    buildPrompt: (input) => {
      const slot = getDiff();
      const diff = slot?.diff ?? '';
      const files = parseDiffFiles(diff);
      const paths = extractChangedPathsFromFiles(files);

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `
Finding: ${input.findingTitle}
Details: ${input.findingDetails}
Changed Files: ${paths.join(', ')}

Diff:
${diff}
`,
      };
    },
  });
}
