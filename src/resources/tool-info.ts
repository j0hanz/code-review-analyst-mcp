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

const TOOL_NAMES = Object.keys(TOOL_INFO_ENTRIES);

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
