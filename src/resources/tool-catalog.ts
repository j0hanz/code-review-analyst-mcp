import { toInlineCode } from '../lib/format.js';

import { buildCoreContextPack } from './tool-info.js';

const TOOL_CATALOG_CONTENT = `# Tool Catalog Details

## Optional Parameters

- ${toInlineCode('language')}: Primary language hint (auto-detects). All tools except ${toInlineCode('suggest_search_replace')}.
- ${toInlineCode('focusAreas')}: Focus tags (security, performance, etc.). ${toInlineCode('inspect_code_quality')} only.
- ${toInlineCode('maxFindings')}: Output cap (1–25). ${toInlineCode('inspect_code_quality')} only.
- ${toInlineCode('testFramework')}: Framework hint. ${toInlineCode('generate_test_plan')} only.
- ${toInlineCode('maxTestCases')}: Output cap (1–30). ${toInlineCode('generate_test_plan')} only.

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

- **Triage**: ${toInlineCode('analyze_pr_impact')}, ${toInlineCode('generate_review_summary')}.
- **Inspection**: ${toInlineCode('inspect_code_quality')}.
- **Fixes**: ${toInlineCode('suggest_search_replace')} (one finding/call).
- **Tests**: ${toInlineCode('generate_test_plan')}.
- **Complexity**: ${toInlineCode('analyze_time_space_complexity')}.
- **Breaking API**: ${toInlineCode('detect_api_breaking_changes')}.
`;

export function buildToolCatalog(): string {
  return `${buildCoreContextPack()}\n\n${TOOL_CATALOG_CONTENT}`;
}
