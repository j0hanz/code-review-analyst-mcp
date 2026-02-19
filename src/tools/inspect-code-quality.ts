import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { validateContextBudget } from '../lib/context-budget.js';
import { validateDiffBudget } from '../lib/diff-budget.js';
import { formatFileSummary, parseDiffFiles } from '../lib/diff-parser.js';
import { PRO_MODEL, PRO_THINKING_BUDGET } from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { InspectCodeQualityInputSchema } from '../schemas/inputs.js';
import { CodeQualityResultSchema } from '../schemas/outputs.js';

const DEFAULT_LANGUAGE = 'detect';
const DEFAULT_FOCUS_AREAS = 'General';
const FILE_CONTEXT_HEADING = '\nFull File Context:\n';
const SYSTEM_INSTRUCTION = `
You are a principal software engineer performing a deep code review.
Analyze the diff and provided file context to identify bugs, security issues, and quality problems.
Consider interactions between changed code and surrounding code.
Prioritize correctness and maintainability.
Return strict JSON only.
`;

function formatFileContext(
  files: readonly { path: string; content: string }[] | undefined
): string {
  if (!files || files.length === 0) {
    return '';
  }

  const fileBlocks = files
    .map(
      (file) => `
<file path="${file.path}">
${file.content}
</file>
`
    )
    .join('\n');

  return `${FILE_CONTEXT_HEADING}${fileBlocks}`;
}

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
      const fileContext = formatFileContext(input.files);
      const prompt = `
Repository: ${input.repository}
Language: ${input.language ?? DEFAULT_LANGUAGE}
Focus Areas: ${input.focusAreas?.join(', ') ?? DEFAULT_FOCUS_AREAS}
Changed Files:
${fileSummary}

Diff:
${input.diff}
${fileContext}
`;
      return { systemInstruction: SYSTEM_INSTRUCTION, prompt };
    },
  });
}
