import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateContextBudget } from '../lib/context-budget.js';
import { validateDiffBudget } from '../lib/diff-budget.js';
import { formatFileSummary, parseDiffFiles } from '../lib/diff-parser.js';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_TIMEOUT_PRO_MS,
  PRO_MODEL,
  PRO_THINKING_BUDGET,
} from '../lib/model-config.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { InspectCodeQualityInputSchema } from '../schemas/inputs.js';
import { CodeQualityResultSchema } from '../schemas/outputs.js';

const DEFAULT_FOCUS_AREAS = 'General';
const DEFAULT_MAX_FINDINGS = 'auto';
const FILE_CONTEXT_HEADING = '\nFull File Context:\n';
const PATH_ESCAPE_REPLACEMENTS = {
  '"': '\\"',
  '\n': ' ',
  '\r': ' ',
} as const;
const PATH_ESCAPE_PATTERN = /["\n\r]/g;
const SYSTEM_INSTRUCTION = `
You are a principal software engineer performing a deep code review.
Analyze the diff and provided file context to identify bugs, security issues, and quality problems.
Consider interactions between changed code and surrounding code.
Prioritize correctness and maintainability.
Return strict JSON only.
`;

export function sanitizePath(path: string): string {
  return path.replace(PATH_ESCAPE_PATTERN, (match) => {
    return PATH_ESCAPE_REPLACEMENTS[
      match as keyof typeof PATH_ESCAPE_REPLACEMENTS
    ];
  });
}

export function sanitizeContent(content: string): string {
  return content
    .replaceAll('<<END_FILE>>', '<END_FILE_ESCAPED>')
    .replaceAll('<<FILE', '<FILE');
}

function formatFileContext(
  files: readonly { path: string; content: string }[] | undefined
): string {
  if (!files || files.length === 0) {
    return '';
  }

  let fileBlocks = '';
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!file) {
      continue;
    }

    fileBlocks += `
<<FILE path="${sanitizePath(file.path)}">>
${sanitizeContent(file.content)}
<<END_FILE>>
`;
    if (index < files.length - 1) {
      fileBlocks += '\n';
    }
  }

  return `${FILE_CONTEXT_HEADING}${fileBlocks}`;
}

export function registerInspectCodeQualityTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'inspect_code_quality',
    title: 'Inspect Code Quality',
    description: 'Deep-dive code review with optional file context.',
    inputSchema: InspectCodeQualityInputSchema,
    fullInputSchema: InspectCodeQualityInputSchema,
    resultSchema: CodeQualityResultSchema,
    errorCode: 'E_INSPECT_QUALITY',
    model: PRO_MODEL,
    thinkingBudget: PRO_THINKING_BUDGET,
    timeoutMs: DEFAULT_TIMEOUT_PRO_MS,
    validateInput: (input) => {
      const diffError = validateDiffBudget(input.diff);
      if (diffError) return diffError;
      return validateContextBudget(input.diff, input.files);
    },
    formatOutput: (result) => {
      return `Code Quality Inspection: ${result.summary}\n${result.findings.length} findings reported.`;
    },
    transformResult: (input, result) => {
      const cappedFindings = result.findings.slice(
        0,
        input.maxFindings ?? result.findings.length
      );

      return {
        ...result,
        findings: cappedFindings,
      };
    },
    buildPrompt: (input) => {
      const files = parseDiffFiles(input.diff);
      const fileSummary = formatFileSummary(files);
      const fileContext = formatFileContext(input.files);
      const prompt = `
Repository: ${input.repository}
Language: ${input.language ?? (DEFAULT_LANGUAGE as string)}
Focus Areas: ${input.focusAreas?.join(', ') ?? DEFAULT_FOCUS_AREAS}
Max Findings: ${input.maxFindings ?? DEFAULT_MAX_FINDINGS}
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
