# Code Review Analyst

Gemini-powered code review MCP server. Accepts unified diffs, returns structured findings.

## Tools

- `analyze_pr_impact` — impact severity, categories, breaking changes, rollback complexity
- `generate_review_summary` — PR summary, risk rating, merge recommendation
- `inspect_code_quality` — deep findings, security/correctness/perf (Pro model, slower)
- `suggest_search_replace` — verbatim search/replace blocks to fix one finding
- `generate_test_plan` — prioritized test cases with pseudocode
- `analyze_complexity` — time/space complexity analysis
- `detect_api_breaking` — breaking API change detection

## Required inputs

All tools require `diff` (unified diff text). `analyze_pr_impact`, `generate_review_summary`, `generate_test_plan` also require `repository`.

## Limits

- Max diff: 120,000 chars (`MAX_DIFF_CHARS`)
- `inspect_code_quality` max context (diff + files): 500,000 chars

## Help

Call the `get-help` prompt for full documentation, workflows, and gotchas.
