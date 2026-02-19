# Code Review Report: MCP Gemini Server Implementation

## What’s strong (architecture + protocol hygiene)

- **Protocol/transport discipline is excellent.** Pure stdio, “stdout purity,” SIGINT/SIGTERM shutdown, and using `console.error()` for logs is exactly what you want for a stable MCP stdio server.
- **Clean separation of concerns.** Entrypoint → server bootstrap → registrars → shared factory → Gemini adapter → schema/transform → response shaping. This is the right layering for maintainability.
- **Two-level schema strategy is solid.** Relaxing schema for Gemini structured output, then validating with strict Zod parsing afterward is the correct reliability pattern for “schema-ish” LLM outputs.
- **Tool results are consistent and machine-usable.** The `DefaultOutputSchema` envelope + `structuredContent` + mirrored `content[0].text` makes the server robust across client implementations and is easy to consume.
- **Tasks support is thoughtfully integrated.** Declared capabilities, task store, progress notifications, and cancellation signal wiring are all the right pieces.

## High-impact issues / risks to address

### 1) Task lifecycle semantics likely need tightening

From the workflow, on failure you “store failed result” but the task status handling looks inconsistent:

- **Error path:** `updateTaskStatus(id, 'working', msg)` then `storeTaskResult(... 'failed' ...)`. That means the task may remain “working” even after a failed result exists. Clients that poll `tasks/get` might show “working” while `tasks/result` is already failed.
- **Budget-exceeded path:** you store a failed result, but the workflow doesn’t clearly state you also set task status to `failed`.
- **Cancellation path:** you update to `cancelled`, but it’s unclear whether you _also_ store a cancellation result payload, which many clients appreciate for a deterministic `tasks/result` response.

**Recommendation:** Make task status and task result mutually consistent:

- On failure: `updateTaskStatus(id, 'failed', msg)` (or equivalent) **before/when** storing the failed result.
- On budget rejection: set status to `failed` and store the error result.
- On cancellation: set status to `cancelled` and store a cancellation result (e.g., `{ok:false,error:{code:'E_CANCELLED', kind:'cancelled', retryable:false}}`), unless the SDK already guarantees a canonical cancelled result.

### 2) “Task-augmented” execution may not actually return early

Your workflow describes createTask running the whole Gemini pipeline and then returning `{task}`. If that’s literally happening inline, then the client won’t get the `taskId` until the long-running work finishes, undermining the point of tasks.

**Recommendation:** Ensure the task execution is actually decoupled:

- `createTask` should create/store task as `working`, return it immediately, and continue work asynchronously (same process, but not blocking the response). This can be as simple as scheduling the pipeline with `void Promise.resolve().then(async () => ...)` (or `queueMicrotask`) after creating/storing the task, while `createTask` returns immediately.

This preserves all your current shape/tools—just fixes semantics and client UX.

### 3) Unknown-field “strictness” may be weaker than it looks

You state `z.strictObject()` rejects unknown fields, but also note the SDK strips unknown fields before your full schema parses. That means callers can send misspelled/extra keys and they’ll be silently dropped rather than rejected (depending on SDK behavior).

**Recommendation:** Decide what you want:

- If you **want strict rejection** of unknown keys, you need access to the raw params (often not possible with SDK stripping) or a different registration strategy.
- If you’re fine with **“best effort” unknown stripping**, document it clearly (so users don’t assume typos will error).

At minimum: align documentation and tests with the real behavior.

## Medium-impact improvements (polish, resilience, DX)

### 4) Improve `content[0].text` ergonomics without breaking structured output

Right now you mirror JSON into text. That’s great for machines, but not great for humans (and some clients display `content` more prominently than `structuredContent`).

**Recommendation (non-breaking):**

- Keep `structuredContent` identical.
- Change `content[0].text` to a concise, human-readable summary (plus maybe a short JSON snippet), while still optionally including full JSON only when `DEBUG` or a flag is set.
  This improves “default” UX without changing any tool contract.

### 5) Tighten severity/risk ordering contracts

Your workflow says findings are sorted by `critical→high→medium→low`. Ensure this is:

- Enforced in schema enums
- Enforced in transform function sorting
- Stable even when the model outputs unknown/typo severities (map to `low` or drop with a validation error, but do it deterministically).

### 6) Logging and observability: add correlation IDs consistently

You already have request context via `AsyncLocalStorage` and you emit structured log events.

**Recommendation:** Include a `requestId` (and tool name, taskId) on every log event payload—consistently. It makes debugging multi-tool concurrency dramatically easier.

### 7) Expand tests around the “hard parts”

Your current test suite covers schemas, transforms, budget, and discovery well.

Add high ROI tests that validate runtime semantics:

- **Task lifecycle correctness:** status transitions (`working→completed/failed/cancelled`) and that `tasks/get` matches stored result state.
- **Cancellation:** cancel during Gemini call and verify final state + no further progress notifications.
- **Completions:** you already note this as missing—add it; it’s cheap and prevents regressions.

### 8) Make retry/timeout behavior externally transparent (without new tools)

You already log retry attempts and have retryable classifications.

**Recommendation:** Put retry/timeout info into the error envelope (e.g., `error.retryable`, `error.kind`, maybe a `details` object with `attempts`, `timeoutMs`), so clients/LLMs can decide how to proceed without reading logs.

## Security posture notes

- You’ve minimized stdio attack surface (big win) and you don’t leak secrets in logs/results.
- One item to revisit: if “BLOCK_NONE” is a default harm threshold, that’s a deliberate choice—make sure it’s explicit in documentation and easy to override via env/config (you already mention an env override).

## Priority action list (practical order)

1. **Fix task status/result consistency** (failed/cancelled states)
2. **Ensure `createTask` returns immediately** and runs pipeline async (true task semantics)
3. **Decide and document unknown-key behavior** (reject vs strip)
4. Improve `content[0].text` for human readability (keep structuredContent stable)
5. Add tests: task lifecycle, cancellation, completions
