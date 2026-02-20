import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateDiffBudget } from '../lib/diff-budget.js';
import {
  extractChangedPathsFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import {
  DEFAULT_TIMEOUT_PRO_MS,
  PRO_MODEL,
  PRO_THINKING_BUDGET,
} from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { SuggestSearchReplaceInputSchema } from '../schemas/inputs.js';
import { SearchReplaceResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are a code remediation expert. Generate minimal search-and-replace blocks to fix exactly the described issue.
CRITICAL: 'search' must be verbatim — character-exact whitespace and indentation.
Never modify code outside the fix scope. If the target cannot be located precisely, omit the block rather than guessing.
Return strict JSON only.
`;

function formatPatchCount(count: number): string {
  return `${count} ${count === 1 ? 'patch' : 'patches'}`;
}

function buildSuggestSearchReplacePrompt(input: {
  findingTitle: string;
  findingDetails: string;
  diff: string;
}): string {
  const files = parseDiffFiles(input.diff);
  const paths = extractChangedPathsFromFiles(files);

  return `
Finding: ${input.findingTitle}
Details: ${input.findingDetails}
Changed Files: ${paths.join(', ')}

Diff:
${input.diff}
`;
}

export function registerSuggestSearchReplaceTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'suggest_search_replace',
    title: 'Suggest Search & Replace',
    description: 'Generate search-and-replace blocks to fix a finding.',
    inputSchema: SuggestSearchReplaceInputSchema,
    fullInputSchema: SuggestSearchReplaceInputSchema,
    resultSchema: SearchReplaceResultSchema,
    errorCode: 'E_SUGGEST_SEARCH_REPLACE',
    model: PRO_MODEL,
    thinkingBudget: PRO_THINKING_BUDGET,
    timeoutMs: DEFAULT_TIMEOUT_PRO_MS,
    validateInput: (input) => validateDiffBudget(input.diff),
    formatOutcome: (result) => formatPatchCount(result.blocks.length),
    formatOutput: (result) => {
      const count = result.blocks.length;
      const patches = formatPatchCount(count);
      return `${result.summary}\n${patches} • Checklist: ${result.validationChecklist.join(' | ')}`;
    },
    buildPrompt: (input) => ({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildSuggestSearchReplacePrompt(input),
    }),
  });
}
