import { toBulletedList, toInlineCode } from '../lib/markdown.js';
import { getToolContract, getToolContracts } from '../lib/tool-contracts.js';

interface ToolInfoEntry {
  name: string;
  purpose: string;
  model: string;
  thinkingLevel: string;
  timeout: string;
  maxOutputTokens: string;
  params: string;
  outputShape: string;
  gotchas: readonly string[];
  crossToolFlow: readonly string[];
  constraints?: readonly string[];
}

const GLOBAL_CONSTRAINTS = [
  'Diff budget: <= 120K chars.',
  'Structured output: tools return both `structuredContent` and JSON text `content`.',
] as const;

const numberFormatter = new Intl.NumberFormat('en-US');

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatTimeout(timeoutMs: number): string {
  return `${Math.round(timeoutMs / 1_000)}s`;
}

function formatThinkingLevel(thinkingLevel: string | undefined): string {
  return thinkingLevel ?? '-';
}

function formatParameterRow(entry: {
  name: string;
  type: string;
  required: boolean;
  constraints: string;
  description: string;
}): string {
  return `| ${entry.name} | ${entry.type} | ${entry.required ? 'Yes' : 'No'} | ${entry.constraints} | ${entry.description} |`;
}

function toToolInfoEntry(
  contract: ReturnType<typeof getToolContracts>[number]
): ToolInfoEntry {
  const parameterRows = [
    '| Param | Type | Required | Constraints | Description |',
    '|-------|------|----------|-------------|-------------|',
    ...contract.params.map((parameter) => formatParameterRow(parameter)),
  ];

  return {
    name: contract.name,
    purpose: contract.purpose,
    model: contract.model,
    thinkingLevel: formatThinkingLevel(contract.thinkingLevel),
    timeout: formatTimeout(contract.timeoutMs),
    maxOutputTokens: formatNumber(contract.maxOutputTokens),
    params: parameterRows.join('\n'),
    outputShape: `\`${contract.outputShape}\``,
    gotchas: contract.gotchas,
    crossToolFlow: contract.crossToolFlow,
    ...(contract.constraints
      ? { constraints: contract.constraints }
      : undefined),
  };
}

const TOOL_INFO_ENTRIES = Object.fromEntries(
  getToolContracts().map((contract) => [
    contract.name,
    toToolInfoEntry(contract),
  ])
) as Record<string, ToolInfoEntry>;

const TOOL_NAMES = Object.keys(TOOL_INFO_ENTRIES).sort((a, b) =>
  a.localeCompare(b)
);

function collectToolConstraints(
  entries: Record<string, ToolInfoEntry>
): string[] {
  const constraints = new Set<string>();

  for (const [toolName, entry] of Object.entries(entries)) {
    for (const constraint of entry.constraints ?? []) {
      constraints.add(`\`${toolName}\`: ${constraint}`);
    }
  }

  return Array.from(constraints).sort((a, b) => a.localeCompare(b));
}

function formatToolInfo(entry: ToolInfoEntry): string {
  return `# ${entry.name}
${entry.purpose}

## Model
\`${entry.model}\` (Thinking: ${entry.thinkingLevel}, Timeout: ${entry.timeout}, Tokens: ${entry.maxOutputTokens})

## Parameters
${entry.params}

## Output
${entry.outputShape}

## Constraints
${entry.gotchas.map((g) => `- ${g}`).join('\n')}
${entry.crossToolFlow.map((f) => `- ${f}`).join('\n')}
`;
}

function formatCompactToolRow(entry: ToolInfoEntry): string {
  return `| ${toInlineCode(entry.name)} | ${entry.model} | ${entry.timeout} | ${entry.maxOutputTokens} | ${entry.purpose} |`;
}

export function buildCoreContextPack(): string {
  const rows = TOOL_NAMES.flatMap((toolName) => {
    const entry = TOOL_INFO_ENTRIES[toolName];
    return entry ? [formatCompactToolRow(entry)] : [];
  });

  return `# Core Context Pack

## Server Essentials
- Domain: Gemini-powered MCP server for diff-based code review.
- Surface: 7 review tools + internal resources + guided prompts.
- Transport: stdio with task lifecycle support.

## Tool Matrix
| Tool | Model | Timeout | Max Output Tokens | Purpose |
|------|-------|---------|-------------------|---------|
${rows.join('\n')}

## Shared Constraints
${toBulletedList(getSharedConstraints())}
`;
}

export function getSharedConstraints(): readonly string[] {
  const toolConstraints = collectToolConstraints(TOOL_INFO_ENTRIES);
  return [...GLOBAL_CONSTRAINTS, ...toolConstraints];
}

export function getToolInfoNames(): string[] {
  return TOOL_NAMES;
}

export function getToolInfo(toolName: string): string | undefined {
  const entry = TOOL_INFO_ENTRIES[toolName];
  if (!entry) {
    return undefined;
  }
  return formatToolInfo(entry);
}

export function getToolPurpose(toolName: string): string | undefined {
  return getToolContract(toolName)?.purpose;
}
