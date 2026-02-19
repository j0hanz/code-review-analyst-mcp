# Gemini Code Review Tools: Diagnosis & Proposed Improvements

## 🛑 Diagnosis: Why the Current Tools are Struggling

1. **`review_diff` (The "Lack of Context" Problem):** You are passing up to 120,000 characters of raw unified diff text. LLMs perform poorly on raw diffs because they lack the surrounding file context (e.g., type definitions, variable initializations). This leads to generic, hallucinated, or nitpicky feedback (e.g., "missing null check" when the null check happened 10 lines above the diff).
2. **`suggest_patch` (The "Unified Diff Syntax" Problem):** Asking an LLM to generate a valid unified diff (`@@ -x,y +a,b @@`) is notoriously flaky. LLMs struggle with exact line-number math and whitespace matching for context lines. This results in patches that fail to apply cleanly.
3. **`risk_score` (The "Subjective Number" Problem):** Asking an LLM for a 0-100 score is highly subjective. The LLM will likely cluster scores around 40-60 unless the code is explicitly malicious. A number doesn't help a developer merge a PR; actionable categories do.

---

## 💡 Proposed Replacements & New Tools

To make the tools effective, we need to shift from **monolithic diff analysis** to **targeted, deterministic, and context-aware tasks.** ### 1. Replace `risk_score` with `analyze_pr_impact`
Instead of an arbitrary 0-100 score, ask Gemini to identify _objective risk categories_. This provides developers with actionable release-readiness data.

- **Input:** `diff` (string), `repository` (string)
- **Output Schema:**
- `hasBreakingChanges`: boolean
- `breakingChangeDetails`: string[] (e.g., "Changed signature of `getUser()`")
- `hasDependencyUpdates`: boolean
- `hasDatabaseMigrations`: boolean
- `securityHotspots`: string[] (e.g., "Modifies authentication middleware")
- `impactRisk`: enum (`LOW`, `MODERATE`, `HIGH`)

### 2. Replace `suggest_patch` with `suggest_search_replace`

Instead of generating a unified diff, use a "Search and Replace" block pattern. This completely eliminates line-number hallucinations and unified diff syntax errors.

- **Input:** `diff` (string), `findingTitle` (string)
- **Output Schema:**
- `file`: string
- `exactSearchString`: string (The exact existing code to replace, preserving whitespace)
- `replacementString`: string (The new code)
- `explanation`: string

- _Why it works:_ The client applying the patch just runs a string replace in the file, which is infinitely more reliable than applying an LLM-generated `.patch`.

### 3. Split `review_diff` into Two Distinct Tools

Passing a massive diff and asking for everything at once degrades output quality. Split the tasks so Gemini can allocate its attention mechanisms effectively.

**Tool A: `generate_review_summary` (High Success Rate)**
LLMs are incredible at summarization. Use this to generate the PR description or a high-level summary for reviewers.

- **Input:** `diff` (string)
- **Output Schema:**
- `prTitle`: string
- `summaryParagraph`: string
- `bulletedChangelog`: array of `{ category: 'feature'|'fix'|'refactor', description: string }`

**Tool B: `inspect_code_quality` (Targeted Review)**
Instead of reviewing the whole diff, require the client to pass **the full file content** alongside the diff for the specific file being reviewed.

- **Input:** `fileContent` (string), `changedLines` (string or array), `focus` (enum)
- **Output Schema:**
- `defects`: array of `{ severity, codeSnippet, explanation, suggestedFix }`

- _Why it works:_ Giving Gemini the _full_ file content rather than just the unified diff drastically reduces false positives (like suggesting you import a library that is already imported at the top of the file).

### 4. New Tool: `generate_test_plan`

Instead of having `testsNeeded` as a small string array in the main review schema, dedicate a tool to mapping logical branches in the diff to test cases.

- **Input:** `diff` (string)
- **Output Schema:**
- `unitTestsNeeded`: array of `{ functionName, scenarioToTest, assertionTarget }`
- `integrationTestsNeeded`: array of `{ scenario, rationale }`
- `edgeCasesToCover`: array of string (e.g., "What happens if `input.diff` is exactly 120,000 chars?")

---

## 🧠 Gemini Optimization Tips for your Workflow

1. **Leverage Gemini 2.5 Pro for Reasoning:**
   In your `README.md`, the default is `gemini-2.5-flash`. Flash is great for `generate_review_summary`, but for deep code review (`inspect_code_quality` or finding bugs), **`gemini-2.5-pro`** will yield significantly fewer false positives and better logical reasoning. You could add an input field to let the client request "deep reasoning" which flips the adapter to use Pro.
2. **System Prompts vs. Diff Budget:**
   You currently cap diffs at 120k characters. Gemini 2.5 has a 1M+ token context window. While capping is good for cost and latency, the real issue isn't length, it's _attention_. If you pass a 100k diff to Gemini, force it to process chunk by chunk.

- _Prompt upgrade:_ Change your `SYSTEM_INSTRUCTION` from _"Return strict JSON..."_ to _"Analyze the diff file-by-file. Think step-by-step about the execution flow before outputting the final JSON."_ (You can achieve this by adding a `_reasoning` string field at the top of your Zod output schemas where Gemini can "think" before committing to the `findings` array).

1. **Structured Schema Relaxation:**
   You currently use `stripJsonSchemaConstraints()` (which is a great practice). Ensure that for Gemini, you aren't enforcing overly tight `.min()` or `.max()` string length constraints on your output Zod schemas natively, as Gemini sometimes struggles to accurately predict character counts during JSON generation, leading to schema validation failures inside your MCP server.
