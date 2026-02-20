interface ToolInfoEntry {
  name: string;
  purpose: string;
  model: string;
  thinkingBudget: string;
  timeout: string;
  params: string;
  outputShape: string;
  gotchas: string[];
  crossToolFlow: string[];
  constraints?: string[];
}

const TOOL_INFO_ENTRIES: Record<string, ToolInfoEntry> = {
  analyze_pr_impact: {
    name: 'analyze_pr_impact',
    purpose:
      'Assess severity, categories, breaking changes, rollback complexity.',
    model: 'gemini-2.5-flash',
    thinkingBudget: '—',
    timeout: '90s',
    params: [
      '| Param | Type | Required | Constraints |',
      '|-------|------|----------|-------------|',
      '| diff | string | Yes | 10–120K chars |',
      '| repository | string | Yes | 1–200 chars |',
      '| language | string | No | 2–32 chars (auto-detect) |',
    ].join('\n'),
    outputShape:
      '`{severity, categories[], summary, breakingChanges[], affectedAreas[], rollbackComplexity}`',
    gotchas: [
      'Model: Flash (fast).',
      'No file context; diff-only.',
      'rollbackComplexity: trivial, moderate, complex, irreversible.',
    ],
    crossToolFlow: [
      'severity → triage decision.',
      'categories → breaking change check.',
    ],
  },
  generate_review_summary: {
    name: 'generate_review_summary',
    purpose: 'PR summary, risk rating, merge recommendation.',
    model: 'gemini-2.5-flash',
    thinkingBudget: '—',
    timeout: '90s',
    params: [
      '| Param | Type | Required | Constraints |',
      '|-------|------|----------|-------------|',
      '| diff | string | Yes | 10–120K chars |',
      '| repository | string | Yes | 1–200 chars |',
      '| language | string | No | 2–32 chars (auto-detect) |',
    ].join('\n'),
    outputShape:
      '`{summary, overallRisk, keyChanges[], recommendation, stats{filesChanged, linesAdded, linesRemoved}}`',
    gotchas: [
      'stats: Local computation (accurate).',
      'overallRisk: low, medium, high.',
      'Model: Flash (fast).',
    ],
    crossToolFlow: [
      'overallRisk → triage decision.',
      'Use as lightweight gate before inspect_code_quality.',
    ],
  },
  inspect_code_quality: {
    name: 'inspect_code_quality',
    purpose: 'Deep review with optional file context.',
    model: 'gemini-2.5-pro',
    thinkingBudget: '16,384 tokens',
    timeout: '120s',
    params: [
      '| Param | Type | Required | Constraints |',
      '|-------|------|----------|-------------|',
      '| diff | string | Yes | 10–120K chars |',
      '| repository | string | Yes | 1–200 chars |',
      '| language | string | No | 2–32 chars |',
      '| focusAreas | string[] | No | 1–12 items, 2–80 chars each |',
      '| maxFindings | number | No | 1–25 (cap) |',
      '| files | object[] | No | 1–20 files, max 100K chars each |',
    ].join('\n'),
    outputShape:
      '`{summary, overallRisk, findings[], testsNeeded[], contextualInsights[], totalFindings}`\n\nFinding shape: `{severity, file, line, title, explanation, recommendation}`',
    gotchas: [
      'Model: Pro (thinking, ~60s).',
      'Context limit: diff + files < 500K chars.',
      'maxFindings caps results post-generation.',
      'contextualInsights empty without files.',
    ],
    crossToolFlow: [
      'findings[].title → suggest_search_replace.findingTitle',
      'findings[].explanation → suggest_search_replace.findingDetails',
      'Combine with generate_test_plan.',
    ],
    constraints: ['Context budget (diff + files) < 500K chars.'],
  },
  suggest_search_replace: {
    name: 'suggest_search_replace',
    purpose: 'Generate verbatim search/replace fix for one finding.',
    model: 'gemini-2.5-pro',
    thinkingBudget: '16,384 tokens',
    timeout: '120s',
    params: [
      '| Param | Type | Required | Constraints |',
      '|-------|------|----------|-------------|',
      '| diff | string | Yes | 10–120K chars |',
      '| findingTitle | string | Yes | 3–160 chars |',
      '| findingDetails | string | Yes | 10–3,000 chars |',
    ].join('\n'),
    outputShape:
      '`{summary, blocks[], validationChecklist[]}`\n\nBlock shape: `{file, search, replace, explanation}`',
    gotchas: [
      'Model: Pro (thinking, ~60s).',
      'Search text must match file verbatim (whitespace exact).',
      'One finding per call.',
      'No repository/language params.',
    ],
    crossToolFlow: [
      'Input: findingTitle from inspect_code_quality',
      'Input: findingDetails from inspect_code_quality',
      'Validate blocks[].search before apply.',
    ],
    constraints: ['One finding per call; verbatim `search` match required.'],
  },
  generate_test_plan: {
    name: 'generate_test_plan',
    purpose: 'Create test plan with pseudocode.',
    model: 'gemini-2.5-flash',
    thinkingBudget: '8,192 tokens',
    timeout: '90s',
    params: [
      '| Param | Type | Required | Constraints |',
      '|-------|------|----------|-------------|',
      '| diff | string | Yes | 10–120K chars |',
      '| repository | string | Yes | 1–200 chars |',
      '| language | string | No | 2–32 chars |',
      '| testFramework | string | No | 1–50 chars |',
      '| maxTestCases | number | No | 1–30 (cap) |',
    ].join('\n'),
    outputShape:
      '`{summary, testCases[], coverageSummary}`\n\nTestCase shape: `{name, type, file, description, pseudoCode, priority}`',
    gotchas: [
      'Model: Flash (thinking).',
      'maxTestCases caps results post-generation.',
      'Priority: must_have → should_have → nice_to_have.',
    ],
    crossToolFlow: [
      'Standalone or after inspect_code_quality.',
      'testCases[].file suggests placement.',
    ],
  },
  analyze_time_space_complexity: {
    name: 'analyze_time_space_complexity',
    purpose: 'Analyze Big-O complexity and degradations.',
    model: 'gemini-2.5-pro',
    thinkingBudget: '16,384 tokens',
    timeout: '120s',
    params: [
      '| Param | Type | Required | Constraints |',
      '|-------|------|----------|-------------|',
      '| diff | string | Yes | 10–120K chars |',
      '| language | string | No | 2–32 chars |',
    ].join('\n'),
    outputShape:
      '`{timeComplexity, spaceComplexity, explanation, potentialBottlenecks[], isDegradation}`',
    gotchas: [
      'Model: Pro (~60s).',
      'No repository param.',
      'isDegradation: true if complexity worsens.',
    ],
    crossToolFlow: [
      'Use for algorithm changes.',
      'potentialBottlenecks → focusAreas.',
    ],
  },
  detect_api_breaking_changes: {
    name: 'detect_api_breaking_changes',
    purpose: 'Detect public API/interface breaking changes.',
    model: 'gemini-2.5-flash',
    thinkingBudget: '—',
    timeout: '90s',
    params: [
      '| Param | Type | Required | Constraints |',
      '|-------|------|----------|-------------|',
      '| diff | string | Yes | 10–120K chars |',
      '| language | string | No | 2–32 chars |',
    ].join('\n'),
    outputShape:
      '`{hasBreakingChanges, breakingChanges[]}`\n\nBreakingChange shape: `{element, natureOfChange, consumerImpact, suggestedMitigation}`',
    gotchas: [
      'Model: Flash (fast).',
      'No repository param.',
      'Empty breakingChanges if hasBreakingChanges is false.',
    ],
    crossToolFlow: [
      'Use for API changes.',
      'Inform suggest_search_replace details.',
    ],
  },
};

const TOOL_NAMES = Object.keys(TOOL_INFO_ENTRIES).sort((a, b) =>
  a.localeCompare(b)
);
const GLOBAL_CONSTRAINTS = [
  'Diff budget: < 120K chars.',
  'Structured output: tools return both `structuredContent` and JSON text `content`.',
] as const;

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

## Purpose
${entry.purpose}

## Model
\`${entry.model}\` (thinking budget: ${entry.thinkingBudget}, timeout: ${entry.timeout})

## Parameters
${entry.params}

## Output Shape
${entry.outputShape}

## Gotchas
${entry.gotchas.map((g) => `- ${g}`).join('\n')}

## Cross-Tool Flow
${entry.crossToolFlow.map((f) => `- ${f}`).join('\n')}
`;
}

function formatCompactToolRow(entry: ToolInfoEntry): string {
  return `| \`${entry.name}\` | ${entry.model} | ${entry.timeout} | ${entry.purpose} |`;
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
| Tool | Model | Timeout | Purpose |
|------|-------|---------|---------|
${rows.join('\n')}

## Shared Constraints
${getSharedConstraints()
  .map((constraint) => `- ${constraint}`)
  .join('\n')}
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
  return TOOL_INFO_ENTRIES[toolName]?.purpose;
}
