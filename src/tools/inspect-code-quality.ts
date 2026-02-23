import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateContextBudget } from '../lib/context-budget.js';
import { computeDiffStatsAndSummaryFromFiles } from '../lib/diff-parser.js';
import {
  buildStructuredToolRuntimeOptions,
  requireToolContract,
} from '../lib/tool-contracts.js';
import { registerStructuredToolTask } from '../lib/tool-factory.js';
import { InspectCodeQualityInputSchema } from '../schemas/inputs.js';
import {
  CodeQualityOutputSchema,
  CodeQualityResultSchema,
} from '../schemas/outputs.js';

const DEFAULT_FOCUS_AREAS = 'General';
const FILE_CONTEXT_HEADING = '\nFull File Context:\n';
const PATH_ESCAPE_REPLACEMENTS = {
  '"': '\\"',
  '\n': ' ',
  '\r': ' ',
  '<': '&lt;',
  '>': '&gt;',
} as const;
const PATH_ESCAPE_PATTERN = /["\n\r<>]/g;
const SYSTEM_INSTRUCTION = `
You are a principal engineer performing a deep code review. The unified diff is your primary source of truth — it contains every changed line. File excerpts, if provided, supply supplementary context only (e.g. class structure, imports). Identify bugs, security vulnerabilities, performance issues, and maintainability risks.
Ignore style issues unless they cause runtime risk. Prioritize correctness and failure modes.
Return strict JSON only.
`;
const TOOL_CONTRACT = requireToolContract('inspect_code_quality');

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

function formatOptionalLine(
  label: string,
  value: string | number | undefined
): string {
  return value === undefined ? '' : `\n${label}: ${value}`;
}

function capFindings<T>(findings: readonly T[], maxFindings?: number): T[] {
  return findings.slice(0, maxFindings ?? findings.length);
}

function formatFileContext(
  files: readonly { path: string; content: string }[] | undefined
): string {
  if (!files || files.length === 0) {
    return '';
  }

  const fileBlocks: string[] = [];
  for (const file of files) {
    fileBlocks.push(`
<<FILE path="${sanitizePath(file.path)}">>
${sanitizeContent(file.content)}
<<END_FILE>>
`);
  }

  return `${FILE_CONTEXT_HEADING}${fileBlocks.join('\n')}`;
}

export function registerInspectCodeQualityTool(server: McpServer): void {
  registerStructuredToolTask(server, {
    name: 'inspect_code_quality',
    title: 'Inspect Code Quality',
    description:
      'Deep code review. Prerequisite: generate_diff. Auto-infer repo/language/focus. Operates primarily on the diff; files are optional supplementary excerpts only.',

    inputSchema: InspectCodeQualityInputSchema,
    fullInputSchema: InspectCodeQualityInputSchema,
    resultSchema: CodeQualityOutputSchema,
    geminiSchema: CodeQualityResultSchema,
    errorCode: 'E_INSPECT_QUALITY',
    model: TOOL_CONTRACT.model,
    timeoutMs: TOOL_CONTRACT.timeoutMs,
    maxOutputTokens: TOOL_CONTRACT.maxOutputTokens,
    ...buildStructuredToolRuntimeOptions(TOOL_CONTRACT),
    progressContext: (input) => {
      const fileCount = input.files?.length;
      return fileCount ? `+${fileCount} files` : '';
    },
    requiresDiff: true,
    validateInput: (input, ctx) => {
      // Diff presence and budget checked by requiresDiff: true
      return validateContextBudget(ctx.diffSlot?.diff ?? '', input.files);
    },
    formatOutcome: (result) =>
      `${result.findings.length} findings, risk: ${result.overallRisk}`,
    formatOutput: (result) => {
      const count = result.findings.length;
      const total = result.totalFindings ?? count;
      const findingsSuffix =
        count < total
          ? `${count} of ${total} findings reported.`
          : `${count} findings reported.`;
      return `Code Quality Inspection: ${result.summary}\n${findingsSuffix}`;
    },
    transformResult: (input, result) => {
      const totalFindings = result.findings.length;
      const cappedFindings = capFindings(result.findings, input.maxFindings);
      return { ...result, findings: cappedFindings, totalFindings };
    },
    buildPrompt: (input, ctx) => {
      const diff = ctx.diffSlot?.diff ?? '';
      const parsedFiles = ctx.diffSlot?.parsedFiles ?? [];
      const { summary: fileSummary } =
        computeDiffStatsAndSummaryFromFiles(parsedFiles);
      const fileContext = formatFileContext(input.files);
      const languageLine = formatOptionalLine('Language', input.language);
      const maxFindingsLine = formatOptionalLine(
        'Max Findings',
        input.maxFindings
      );
      const noFilesNote = !input.files?.length
        ? '\nNote: No file excerpts provided. Review based on diff only; leave contextualInsights empty.'
        : '';

      return {
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `
Repository: ${input.repository}${languageLine}
Focus Areas: ${input.focusAreas?.join(', ') ?? DEFAULT_FOCUS_AREAS}${maxFindingsLine}${noFilesNote}
Changed Files:
${fileSummary}

Diff:
${diff}
${fileContext}

Based on the diff and file context above, perform a deep code review focusing on the specified areas.
`,
      };
    },
  });
}
