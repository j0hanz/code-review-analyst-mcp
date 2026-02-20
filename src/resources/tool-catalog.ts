const TOOL_CATALOG_CONTENT = `# Tool Catalog

## Quick Reference

| Tool | Model | Think | Time | Params | Outputs |
|------|-------|-------|------|--------|---------|
| \`analyze_pr_impact\` | Flash | — | 90s | diff, repository | severity, categories[], rollbackComplexity |
| \`generate_review_summary\` | Flash | — | 90s | diff, repository | overallRisk, keyChanges[], recommendation, stats |
| \`inspect_code_quality\` | Pro | 16K | 120s | diff, repository | findings[], contextualInsights[], testsNeeded[] |
| \`suggest_search_replace\` | Pro | 16K | 120s | diff, findingTitle, findingDetails | blocks[] (file, search, replace), validationChecklist[] |
| \`generate_test_plan\` | Flash | 8K | 90s | diff, repository | testCases[] (name, type, pseudoCode, priority), coverageSummary |
| \`analyze_time_space_complexity\` | Pro | 16K | 120s | diff | timeComplexity, spaceComplexity, isDegradation, potentialBottlenecks[] |
| \`detect_api_breaking_changes\` | Flash | — | 90s | diff | hasBreakingChanges, breakingChanges[] |

## Optional Parameters

- \`language\`: Primary language hint (auto-detects). All tools except \`suggest_search_replace\`.
- \`focusAreas\`: Focus tags (security, performance, etc.). \`inspect_code_quality\` only.
- \`maxFindings\`: Output cap (1–25). \`inspect_code_quality\` only.
- \`files\`: File context (max 20 files, 100K chars/file). \`inspect_code_quality\` only.
- \`testFramework\`: Framework hint. \`generate_test_plan\` only.
- \`maxTestCases\`: Output cap (1–30). \`generate_test_plan\` only.

## Cross-Tool Data Flow

\`\`\`
analyze_pr_impact ──→ severity/categories ──→ triage decision
                                              │
generate_review_summary ──→ overallRisk ──────┤
                                              ▼
                                    inspect_code_quality
                                              │
                                    findings[].title ──→ suggest_search_replace.findingTitle
                                    findings[].explanation ──→ suggest_search_replace.findingDetails
                                              │
                                    diff ─────┴──→ generate_test_plan
\`\`\`

## When to Use Each Tool

- **Triage**: \`analyze_pr_impact\`, \`generate_review_summary\` (Flash).
- **Inspection**: \`inspect_code_quality\` (Pro).
- **Fixes**: \`suggest_search_replace\` (one finding/call).
- **Tests**: \`generate_test_plan\`.
- **Complexity**: \`analyze_time_space_complexity\`.
- **Breaking API**: \`detect_api_breaking_changes\`.

## Key Constraints

- Diff limit: < 120K chars (shared).
- Context limit: diff + files < 500K chars.
- \`suggest_search_replace\`: One finding/call. Verbatim match required.
- Stats: Computed locally (accurate).
`;

export function buildToolCatalog(): string {
  return TOOL_CATALOG_CONTENT;
}
