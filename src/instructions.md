# CODE REVIEW ANALYST MCP INSTRUCTIONS

These instructions are available as a resource (internal://instructions) or prompt (get-help). Load them when unsure about tool usage.

---

## CORE CAPABILITY

- Domain: Analyze pull request diffs with Gemini and return structured review findings, risk scores, and focused patch suggestions for automation clients.
- Primary Resources: Unified diff text, structured JSON review results, release-risk assessments, and search/replace suggestions.
- Tools: `analyze_pr_impact`, `generate_review_summary`, `inspect_code_quality`, `suggest_search_replace`, `generate_test_plan`.

---

## PROMPTS

- `get-help`: Returns these instructions for quick recall.

---

## RESOURCES & RESOURCE LINKS

- `internal://instructions`: This document.

---

## PROGRESS & TASKS

- Include `_meta.progressToken` in requests to receive `notifications/progress` updates.
- All tools support task execution (`execution.taskSupport: "optional"`).
  - Invoke normally for direct results, or with `task` parameter for async execution.
  - Poll `tasks/get` and fetch results via `tasks/result`.

---

## THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: QUICK PR TRIAGE

1. Call `analyze_pr_impact` to get a severity rating and category breakdown.
2. If severity is low/medium, call `generate_review_summary` for a quick digest.
3. If severity is high/critical, proceed to Workflow B.

### WORKFLOW B: DEEP CODE INSPECTION

1. Call `inspect_code_quality` with the diff and optionally critical files in `files[]`.
2. Review findings and `contextualInsights`.
3. Use `focusAreas` to target specific concerns (security, performance).

### WORKFLOW C: REMEDIATION & TESTING

1. For each valid finding, call `suggest_search_replace` to generate a fix.
2. Call `generate_test_plan` to create a verification strategy for the changes.
3. Apply fixes and implement tests.

---

## TOOL NUANCES & GOTCHAS

`analyze_pr_impact` (Flash Model)

- Purpose: Objective assessment of PR impact (breaking changes, API changes, etc).
- Input: `diff`, `repository`.
- Output: `severity` (low|medium|high|critical), `categories[]`, `breakingChanges[]`.

`generate_review_summary` (Flash Model)

- Purpose: High-level summary and merge recommendation.
- Input: `diff`, `repository`.
- Output: `summary`, `overallRisk`, `recommendation`, `keyChanges[]`.

`inspect_code_quality` (Pro Model + Thinking)

- Purpose: Deep-dive review. Uses Pro model with thinking budget (16k tokens) for complex reasoning.
- Input: `diff`, `files[]` (optional context).
- Output: `findings[]`, `contextualInsights[]`, `overallRisk`.
- Gotcha: Enforces `MAX_CONTEXT_CHARS` (default 500k) on combined diff + files size.
- Latency: Expect 60-120s due to deep thinking.

`suggest_search_replace` (Pro Model + Thinking)

- Purpose: Generate verbatim search/replace blocks for fixes.
- Input: `diff`, `findingTitle`, `findingDetails`.
- Output: `blocks[]` (`{file, search, replace}`).
- Gotcha: `search` block must match file content EXACTLY.

`generate_test_plan` (Flash Model + Thinking)

- Purpose: Systematic test case generation.
- Input: `diff`, `testFramework`.
- Output: `testCases[]` (`{type, priority, pseudoCode}`).

---

## CONSTRAINTS & LIMITATIONS

- **Diff Budget:** 120,000 chars (default). Overridable via `MAX_DIFF_CHARS`.
- **Context Budget:** 500,000 chars (diff + files) for `inspect_code_quality`. Overridable via `MAX_CONTEXT_CHARS`.
- **Models:** Uses `gemini-2.5-flash` for fast tools and `gemini-2.5-pro` for deep analysis.
- **Thinking:** Enabled for deep tools. Increases latency but improves quality.

---

## ERROR HANDLING STRATEGY

- `E_INPUT_TOO_LARGE`: Diff or context exceeded budget. Reduce scope.
- `E_ANALYZE_IMPACT` etc: Tool-specific failures. Check API key and quota.
- `Gemini request timed out`: Pro model tasks might time out. Increase client timeout.
