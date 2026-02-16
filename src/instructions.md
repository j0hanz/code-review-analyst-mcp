# CODE REVIEW ANALYST MCP INSTRUCTIONS

These instructions are available as a resource (internal://instructions) or prompt (get-help). Load them when unsure about tool usage.

---

## CORE CAPABILITY

- Domain: Analyze pull request diffs with Gemini and return structured review findings, risk scores, and focused patch suggestions for automation clients.
- Primary Resources: Unified diff text, structured JSON review results, release-risk assessments, and unified-diff patch suggestions.
- Tools: READ: `review_diff`, `risk_score`, `suggest_patch`. WRITE: none.

---

## PROMPTS

- `get-help`: Returns these instructions for quick recall.

---

## RESOURCES & RESOURCE LINKS

- `internal://instructions`: This document.

---

## PROGRESS & TASKS

- Include `_meta.progressToken` in requests to receive `notifications/progress` updates during Gemini processing.
- Task-augmented tool calls are supported for `review_diff`, `risk_score`, and `suggest_patch`:
  - These tools declare `execution.taskSupport: "optional"` — invoke normally or as a task.
  - Send `tools/call` with `task` to get a task id.
  - Poll `tasks/get` and fetch results via `tasks/result`.
  - Use `tasks/cancel` to abort.
  - Task data is stored in memory and cleared on restart.

---

## THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: FULL PR REVIEW

1. Call `review_diff` with `diff` and `repository` to get structured findings and merge risk.
2. Use `focusAreas` to bias analysis toward the highest-priority concerns.
3. Use `maxFindings` to cap result volume when context windows are tight.
   NOTE: Never pass oversized diffs. Pre-check against your own limits and handle `E_INPUT_TOO_LARGE`.

### WORKFLOW B: RELEASE GATE RISK CHECK

1. Call `risk_score` with `diff` to get a 0–100 score, bucket, and rationale.
2. Set `deploymentCriticality` when evaluating sensitive systems.
3. Use score and rationale to decide whether to block or require additional validation.
   NOTE: Call `review_diff` first if you need file-level defect evidence.

### WORKFLOW C: PATCH FROM A SELECTED FINDING

1. Call `review_diff` to identify one concrete finding to fix.
2. Call `suggest_patch` with the same `diff`, plus `findingTitle` and `findingDetails` from that finding.
3. Use `patchStyle` (`minimal`, `balanced`, `defensive`) to control change breadth.
   NOTE: Keep inputs scoped to one finding at a time to avoid mixed patch intent.

---

## TOOL NUANCES & GOTCHAS

`review_diff`

- Purpose: Generate structured review findings, overall risk, and test recommendations from a unified diff.
- Input: `maxFindings` defaults to 10; `focusAreas` defaults to security/correctness/regressions/performance when omitted.
- Output: `ok/result/error` envelope; successful payload follows `ReviewDiffResultSchema` and includes `summary`, `overallRisk`, `findings`, and `testsNeeded`.
- Gotcha: Schema allows `diff` up to 400,000 chars, but runtime rejects payloads above `MAX_DIFF_CHARS` (default 120,000) with `E_INPUT_TOO_LARGE`.
- Side effects: Calls external Gemini API (`openWorldHint: true`); does not mutate local state (`readOnlyHint: true`).

`risk_score`

- Purpose: Produce deployment risk score and rationale for release decisions.
- Input: `deploymentCriticality` defaults to `medium` when omitted.
- Output: `ok/result/error` envelope; successful payload includes `score`, `bucket`, and `rationale`.
- Gotcha: Uses the same runtime diff budget guard as other tools; oversized inputs fail before model execution.
- Side effects: External Gemini call only.

`suggest_patch`

- Purpose: Generate a focused unified diff patch for one selected review finding.
- Input: `patchStyle` defaults to `balanced`; requires both `findingTitle` and `findingDetails`.
- Output: `ok/result/error` envelope; successful payload includes `summary`, `patch`, and `validationChecklist`.
- Gotcha: Output is model-generated text and must be validated before application.
- Side effects: External Gemini call only.

---

## CROSS-FEATURE RELATIONSHIPS

- Use `review_diff` first to generate concrete finding metadata for `suggest_patch` inputs.
- Use `risk_score` after `review_diff` when you need both defect-level detail and a release gate score.
- All tools share the same Gemini adapter, retry policy, timeout policy, and diff-size guard.
- All tool responses include both `structuredContent` and JSON-string `content` for client compatibility.

---

## CONSTRAINTS & LIMITATIONS

- Transport: stdio only in current server entrypoint.
- API credentials: Require `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
- Model selection: Uses `GEMINI_MODEL` if set; defaults to `gemini-2.5-flash`.
- Diff size: Runtime limit defaults to 120,000 chars (`MAX_DIFF_CHARS` env override). Input schema max is 400,000 chars.
- Timeout/retries: Per-call timeout defaults to 15,000 ms; retry count defaults to 1 with exponential backoff.
- Output tokens: `maxOutputTokens` defaults to 16,384 to prevent unbounded responses.
- Safety config: Gemini safety thresholds default to `BLOCK_NONE` for configured harm categories and can be overridden with `GEMINI_HARM_BLOCK_THRESHOLD` (`BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE`).
- Resource scope: Only `internal://instructions` is registered as a resource; no dynamic resource templates are exposed.
- Prompt scope: Only `get-help` is registered.

---

## ERROR HANDLING STRATEGY

- `E_INPUT_TOO_LARGE`: Diff exceeded runtime budget. → Split the diff into smaller chunks or raise `MAX_DIFF_CHARS` safely.
- `E_REVIEW_DIFF`: Review generation failed. → Check API key env vars, reduce diff size, and retry; inspect stderr Gemini logs.
- `E_RISK_SCORE`: Risk scoring failed. → Check connectivity/model availability and retry with same diff.
- `E_SUGGEST_PATCH`: Patch generation failed. → Verify finding inputs are specific and retry with narrower details.
- Missing `GEMINI_API_KEY`/`GOOGLE_API_KEY` (wrapped by tool error codes): Credentials not configured. → Set one API key env var and rerun.
- Gemini timeout message (`Gemini request timed out after ...ms.`): Request exceeded timeout budget. → Reduce prompt/diff size or increase `timeoutMs` in caller.
- Empty model body (`Gemini returned an empty response body.`): Provider returned no text payload. → Retry and inspect model/service status.
- JSON parse failure from model output (wrapped by tool error codes): Output was not valid JSON. → Retry with same schema; inspect logs for malformed response text.

---
