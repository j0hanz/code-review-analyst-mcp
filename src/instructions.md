# CODE REVIEW ANALYST MCP INSTRUCTIONS

These instructions are available as a resource (internal://instructions) or prompt (get-help). Load them when unsure about tool usage.

---

## CORE CAPABILITY

- Domain: Gemini-powered code review analysis — accepts unified diffs and returns structured findings, impact assessments, test plans, and search/replace fixes.
- Primary Resources: Unified diff text, structured JSON review results, impact assessments, test plans.
- Tools: READ: `analyze_pr_impact`, `generate_review_summary`, `inspect_code_quality`, `suggest_search_replace`, `generate_test_plan`. WRITE: none.

---

## PROMPTS

- `get-help`: Returns these instructions for quick recall.
- `review-guide`: Guided workflow for a specific tool and focus area. Accepts `tool` and `focusArea` arguments with auto-completion.

---

## RESOURCES & RESOURCE LINKS

- `internal://instructions`: This document.

---

## PROGRESS & TASKS

- Include `_meta.progressToken` in requests to receive `notifications/progress` updates during Gemini processing.
- Task-augmented tool calls are supported for all five tools:
  - Send `tools/call` with `task` to get a task id.
  - Poll `tasks/get` and fetch results via `tasks/result`.
  - Use `tasks/cancel` to abort.
  - Progress reports 4 steps: start → input validated → prompt prepared → model response received → completed.
  - Task data is stored in memory (30-minute TTL) and cleared on restart.

---

## THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: FULL PR REVIEW

1. Call `generate_review_summary` with `diff` and `repository` to get a high-level summary, risk rating, and merge recommendation.
2. Call `inspect_code_quality` with the same `diff`, `repository`, and optionally `files` for context-aware deep review.
3. For each actionable finding, call `suggest_search_replace` with the `diff`, `findingTitle`, and `findingDetails` from step 2.
   NOTE: Keep `suggest_search_replace` scoped to one finding per call. Pre-check diff size < 120,000 chars before any call.

### WORKFLOW B: IMPACT ASSESSMENT

1. Call `analyze_pr_impact` with `diff` and `repository` to get severity, categories, breaking changes, and rollback complexity.
2. Call `generate_review_summary` with the same `diff` for a complementary merge recommendation.
   NOTE: Use `analyze_pr_impact` when you need categorization (breaking_change, api_change, etc.) and rollback assessment.

### WORKFLOW C: PATCH FROM FINDING

1. Call `inspect_code_quality` with `diff`, `repository`, and `focusAreas` to identify specific findings.
2. Pick one finding. Call `suggest_search_replace` with the same `diff`, plus `findingTitle` and `findingDetails` from that finding.
3. Validate the returned `blocks[]` before applying — `search` text must match file content exactly.
   NOTE: Never batch multiple findings into one `suggest_search_replace` call.

### WORKFLOW D: TEST COVERAGE

1. Call `generate_test_plan` with `diff`, `repository`, and optionally `testFramework` and `maxTestCases`.
2. Review `testCases[]` ordered by priority: `must_have` → `should_have` → `nice_to_have`.
   NOTE: Combine with `inspect_code_quality` when you need finding-aware test targeting.

---

## TOOL NUANCES & GOTCHAS

`analyze_pr_impact`

- Purpose: Assess impact severity, categories, breaking changes, and rollback complexity for a PR diff.
- Input: `diff` (required), `repository` (required), `language` (optional, defaults to auto-detect).
- Output: `severity`, `categories[]`, `breakingChanges[]`, `affectedAreas[]`, `rollbackComplexity`.
- Side effects: Calls external Gemini API (Flash model); does not mutate local state.

`generate_review_summary`

- Purpose: Produce a concise PR summary with risk rating, key changes, and merge recommendation.
- Input: `diff` (required), `repository` (required), `language` (optional).
- Output: `summary`, `overallRisk`, `keyChanges[]`, `recommendation`, `stats` (computed locally from diff, not by Gemini).
- Gotcha: `stats` (filesChanged, linesAdded, linesRemoved) are computed from diff parsing before the Gemini call — they are always accurate.

`inspect_code_quality`

- Purpose: Deep code review with optional full file context for cross-reference analysis.
- Input: `diff` (required), `repository` (required), `language` (optional), `focusAreas` (optional, 1–12 items), `maxFindings` (optional, 1–25), `files` (optional, 1–20 files with `path` and `content`).
- Output: `summary`, `overallRisk`, `findings[]`, `testsNeeded[]`, `contextualInsights[]`, `totalFindings`.
- Gotcha: Uses Pro model with thinking — slower but higher quality than Flash-based tools. Timeout is 120 seconds.
- Gotcha: Combined diff + file context must stay under `MAX_CONTEXT_CHARS` (default 500,000). Provide only relevant files.
- Gotcha: `maxFindings` caps results AFTER Gemini returns. `totalFindings` shows the pre-cap count.
- Limits: Max 20 files, each max 100,000 chars content.

`suggest_search_replace`

- Purpose: Generate verbatim search-and-replace blocks to fix one specific finding.
- Input: `diff` (required), `findingTitle` (3–160 chars), `findingDetails` (10–3,000 chars).
- Output: `summary`, `blocks[]` (each with `file`, `search`, `replace`, `explanation`), `validationChecklist[]`.
- Gotcha: Uses Pro model with thinking (120s timeout). `search` blocks must match exact verbatim text in the file.
- Gotcha: Scope each call to one finding. Multi-finding calls produce mixed patch intent.

`generate_test_plan`

- Purpose: Create an actionable test plan with pseudocode covering changes in the diff.
- Input: `diff` (required), `repository` (required), `language` (optional), `testFramework` (optional, defaults to auto-detect), `maxTestCases` (optional, 1–30).
- Output: `summary`, `testCases[]` (each with `name`, `type`, `file`, `description`, `pseudoCode`, `priority`), `coverageSummary`.
- Gotcha: `maxTestCases` caps results AFTER Gemini returns. Uses Flash model with thinking budget.

---

## CROSS-FEATURE RELATIONSHIPS

- Use `inspect_code_quality` findings (`title` + `explanation`) as `findingTitle` + `findingDetails` for `suggest_search_replace`.
- Use `generate_review_summary` for quick triage before committing to the slower `inspect_code_quality`.
- All tools share the same diff budget guard, Gemini client, retry policy, and concurrency limiter.
- `inspect_code_quality` is the only tool that accepts `files` for full file context — all others analyze diff only.
- All tool responses include both `structuredContent` and JSON-string `content` for client compatibility.

---

## CONSTRAINTS & LIMITATIONS

- Transport: stdio only.
- API credentials: Require `GEMINI_API_KEY` or `GOOGLE_API_KEY` environment variable.
- Model selection: `GEMINI_MODEL` env var overrides the default (gemini-2.5-flash). Pro model tools (`inspect_code_quality`, `suggest_search_replace`) always use gemini-2.5-pro regardless.
- Diff size: Runtime limit defaults to 120,000 chars (`MAX_DIFF_CHARS` env override).
- Context size: Combined diff + files limit defaults to 500,000 chars (`MAX_CONTEXT_CHARS` env override). Only applies to `inspect_code_quality`.
- Timeout: 60 seconds default (Flash tools), 120 seconds for Pro tools. Retry count: 1 with exponential backoff.
- Max output tokens: 16,384 per Gemini call.
- Concurrency: `MAX_CONCURRENT_CALLS` defaults to 10. Excess calls wait up to `MAX_CONCURRENT_CALLS_WAIT_MS` (default 2,000ms).
- Safety: Gemini safety thresholds default to `BLOCK_NONE`. Override with `GEMINI_HARM_BLOCK_THRESHOLD` (`BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE`).
- Task TTL: 30 minutes. Task data is in-memory and lost on process restart.

---

## ERROR HANDLING STRATEGY

- `E_INPUT_TOO_LARGE`: Diff or combined context exceeded budget. → Split the diff into smaller chunks or reduce the number of `files`. Not retryable.
- `E_ANALYZE_IMPACT`: Impact analysis failed. → Check API key env vars, reduce diff size, and retry. Inspect `error.kind` for classification.
- `E_REVIEW_SUMMARY`: Summary generation failed. → Check connectivity/model availability and retry with same diff.
- `E_INSPECT_QUALITY`: Code quality inspection failed. → Reduce diff size or file context, verify API key, and retry.
- `E_SUGGEST_SEARCH_REPLACE`: Search/replace generation failed. → Verify finding inputs are specific and retry with narrower details.
- `E_GENERATE_TEST_PLAN`: Test plan generation failed. → Reduce diff size and retry.
- Error `kind` values: `validation` (bad input, not retryable), `budget` (size exceeded, not retryable), `upstream` (Gemini API error, retryable), `timeout` (exceeded deadline, retryable), `cancelled` (request aborted, not retryable), `internal` (unexpected, not retryable).
- Missing API key: Set `GEMINI_API_KEY` or `GOOGLE_API_KEY` env var and restart.
- Gemini timeout: Reduce diff/context size or increase timeout via tool config.
- Empty model response: Retry — Gemini occasionally returns empty bodies under load.
