import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateDiffBudget } from '../lib/diff-budget.js';
import { extractChangedPaths } from '../lib/diff-parser.js';
import {
  DEFAULT_TIMEOUT_PRO_MS,
  PRO_MODEL,
  PRO_THINKING_BUDGET,
} from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { SuggestSearchReplaceInputSchema } from '../schemas/inputs.js';
import { SearchReplaceResultSchema } from '../schemas/outputs.js';

const SYSTEM_INSTRUCTION = `
You are a code remediation expert.
Generate precise search-and-replace blocks to fix the described issue.
The 'search' block must match exact verbatim text from the file (including whitespace).
Do not invent code that isn't present.
Scope your suggestions to the changed files if possible.
Return strict JSON only.
`;

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
    formatOutput: (result) => {
      const typed = result as z.infer<typeof SearchReplaceResultSchema>;
      return `Search/Replace Suggestion: ${typed.summary}`;
    },
    buildPrompt: (input) => {
      const paths = extractChangedPaths(input.diff);
      const prompt = `
Finding: ${input.findingTitle}
Details: ${input.findingDetails}
Changed Files: ${paths.join(', ')}

Diff:
${input.diff}
`;
      return { systemInstruction: SYSTEM_INSTRUCTION, prompt };
    },
  });
}
