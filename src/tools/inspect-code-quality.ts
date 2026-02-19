import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateContextBudget } from '../lib/context-budget.js';
import { validateDiffBudget } from '../lib/diff-budget.js';
import { formatFileSummary, parseDiffFiles } from '../lib/diff-parser.js';
import { PRO_MODEL, PRO_THINKING_BUDGET } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { InspectCodeQualityInputSchema } from '../schemas/inputs.js';
import { CodeQualityResultSchema } from '../schemas/outputs.js';

export function registerInspectCodeQualityTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'inspect_code_quality',
    title: 'Inspect Code Quality',
    description: 'Deep-dive code review with optional file context.',
    inputSchema: InspectCodeQualityInputSchema.shape,
    fullInputSchema: InspectCodeQualityInputSchema,
    resultSchema: CodeQualityResultSchema,
    errorCode: 'E_INSPECT_QUALITY',
    model: PRO_MODEL,
    thinkingBudget: PRO_THINKING_BUDGET,
    validateInput: (input) => {
      const diffError = validateDiffBudget(input.diff);
      if (diffError) return diffError;
      return validateContextBudget(input.diff, input.files);
    },
    formatOutput: (result) => {
      const typed = result as z.infer<typeof CodeQualityResultSchema>;
      return `Code Quality Inspection: ${typed.summary}\n${typed.findings.length} findings reported.`;
    },
    buildPrompt: (input) => {
      const files = parseDiffFiles(input.diff);
      const fileSummary = formatFileSummary(files);

      let fileContext = '';
      if (input.files && input.files.length > 0) {
        const fileBlocks = input.files
          .map(
            (f) => `
<file path="${f.path}">
${f.content}
</file>
`
          )
          .join('\n');
        fileContext = `\nFull File Context:\n${fileBlocks}`;
      }

      const systemInstruction = `
You are a principal software engineer performing a deep code review.
Analyze the diff and provided file context to identify bugs, security issues, and quality problems.
Consider interactions between changed code and surrounding code.
Prioritize correctness and maintainability.
Return strict JSON only.
`;
      const prompt = `
Repository: ${input.repository}
Language: ${input.language ?? 'detect'}
Focus Areas: ${input.focusAreas?.join(', ') ?? 'General'}
Changed Files:
${fileSummary}

Diff:
${input.diff}
${fileContext}
`;
      return { systemInstruction, prompt };
    },
  });
}
