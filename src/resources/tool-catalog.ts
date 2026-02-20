import { buildCoreContextPack } from './tool-info.js';

const TOOL_CATALOG_CONTENT = `# Tool Catalog Details

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
`;

export function buildToolCatalog(): string {
  return `${buildCoreContextPack()}\n\n${TOOL_CATALOG_CONTENT}`;
}
