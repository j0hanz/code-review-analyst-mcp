const WORKFLOW_GUIDE_CONTENT = `# Workflow Reference

## A: Full PR Review

1. \`generate_review_summary\` → \`{overallRisk, keyChanges[], recommendation, stats}\`
2. \`inspect_code_quality\` → \`{findings[], overallRisk, contextualInsights[]}\`
3. For each finding: \`suggest_search_replace\` → \`{blocks[]}\`

> One finding per \`suggest_search_replace\` call. Pre-check diff < 120K chars.

## B: Impact Assessment

1. \`analyze_pr_impact\` → \`{severity, categories[], breakingChanges[], rollbackComplexity}\`
2. \`generate_review_summary\` → complementary merge recommendation

> Use when categorization (breaking, api) or rollback assessment needed.

## C: Remediation Loop

1. \`inspect_code_quality\` → \`{findings[]}\`
2. Pick one finding. \`suggest_search_replace\` → \`{blocks[]}\`
3. Validate \`blocks[].search\` matches file content verbatim.

> Never batch findings.

## D: Test Coverage

1. \`generate_test_plan\` → \`{testCases[], coverageSummary}\`
2. Review by priority: \`must_have\` → \`should_have\` → \`nice_to_have\`

> Combine with \`inspect_code_quality\`.

## E: Complexity & Breaking Changes

1. \`analyze_time_space_complexity\` → \`{timeComplexity, spaceComplexity, isDegradation}\`
2. \`detect_api_breaking_changes\` → \`{hasBreakingChanges, breakingChanges[]}\`

> Use for algorithm or API changes. Diff-only input.

## Output Shape Reference

### Finding
\`{severity, file, line, title, explanation, recommendation}\`

### Search/Replace Block
\`{file, search, replace, explanation}\`

### Test Case
\`{name, type, file, description, pseudoCode, priority}\`

### Breaking Change
\`{element, natureOfChange, consumerImpact, suggestedMitigation}\`
`;

export function buildWorkflowGuide(): string {
  return WORKFLOW_GUIDE_CONTENT;
}
