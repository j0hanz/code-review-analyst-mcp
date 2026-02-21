# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** Gemini-powered MCP server for automated code review analysis — accepts unified diffs and returns structured findings, risk scores, impact analysis, test plans, and search/replace fixes (see `package.json` description, `server.json`).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9+ (see `"typescript": "^5.9.3"` in `package.json` `devDependencies`), Node.js ≥24 (see `"engines": { "node": ">=24" }` in `package.json`; `node-version: '24'` in `.github/workflows/release.yml`; `FROM node:24-alpine` in `Dockerfile`)
  - **Frameworks:** `@modelcontextprotocol/sdk` v1.26+ (see `dependencies` in `package.json`)
  - **Key Libraries:**
    - `@google/genai` ^1.42.0 — Gemini Developer API client (see `package.json`)
    - `zod` ^4.3.6 — schema validation with Zod v4 APIs (see `package.json`)
    - `parse-diff` ^0.11.1 — unified diff parsing (see `package.json`)
    - `tsx` ^4.21.0 — TypeScript ESM loader used by the test runner (see `package.json` `devDependencies`)
- **Architecture:** Single-package MCP server using stdio transport. Tools are registered via a factory pattern (`registerStructuredToolTask`) that wires Zod input validation → prompt building → Gemini structured JSON generation (with schema retry loop) → Zod output parsing → MCP response with both `content` and `structuredContent`. Supports MCP task lifecycle with `InMemoryTaskStore` (see `src/server.ts`, `src/lib/tool-factory.ts`).

## 2) Repository Map (High-Level)

- `src/` — Main source code (`rootDir` per `tsconfig.json`), compiled to `dist/`
  - `src/index.ts` — CLI entrypoint with `#!/usr/bin/env node` shebang, CLI arg parsing (`--model`, `--max-diff-chars`), stdio transport, shutdown handlers
  - `src/server.ts` — `McpServer` creation, `InMemoryTaskStore`, capability declaration, registration orchestration
  - `src/tools/` — One file per tool (7 tools), each exports a `register*Tool(server)` function; `index.ts` holds the `TOOL_REGISTRARS` array
  - `src/schemas/` — Zod input/output schemas (`inputs.ts`, `outputs.ts`) separated from tool logic
  - `src/lib/` — Shared utilities: Gemini client (`gemini.ts`), tool factory (`tool-factory.ts`), canonical tool contracts (`tool-contracts.ts`), model config (`model-config.ts`), budget guards (`diff-budget.ts`, `context-budget.ts`), env config helper (`env-config.ts`), error helpers (`errors.ts`), Gemini schema stripper (`gemini-schema.ts`), diff parser (`diff-parser.ts`), tool response builders (`tool-response.ts`), shared types (`types.ts`)
  - `src/prompts/` — MCP prompt registration (`get-help`, `review-guide`)
  - `src/resources/` — MCP resource registration (`internal://instructions`, `internal://tool-catalog`, etc.); `instructions.ts` builds runtime instructions from typed tool contracts
- `tests/` — Test files using `node:test` (9 files: `diff-parser.test.ts`, `gemini-schema.test.ts`, `gemini-thinking.test.ts`, `gemini.integration.test.ts`, `inspect-file-context.test.ts`, `new-schemas.test.ts`, `server-discovery.test.ts`, `tool-contract-consistency.test.ts`, `tool-task-lifecycle.test.ts`)
- `scripts/tasks.mjs` — Custom build orchestrator (clean, compile via `tsconfig.build.json`, copy assets, chmod, type-check both src and tests, test runner with loader auto-detection)
- `.github/workflows/release.yml` — Release CI: version bump, lint, type-check, test, build, publish to npm/Docker/MCP Registry
- `Dockerfile` — Multi-stage build: builder (`node:24-alpine`) + lean release image with non-root `mcp` user
- `server.json` — MCP Registry manifest; bumped together with `package.json` on release (see `.github/workflows/release.yml`)
- `plan/` — Empty planning directory (no committed content)
  > Ignore generated/vendor dirs like `dist/`, `node_modules/`.

## 3) Operational Commands (Verified)

- **Environment:** Node.js ≥24, npm (see `package.json` `engines`, `package-lock.json` present). API key required at runtime via `GEMINI_API_KEY` or `GOOGLE_API_KEY` env vars (see `src/lib/gemini.ts`). Copy `.env.example` → `.env` if available and set your key.
- **Install:** `npm ci` (see `.github/workflows/release.yml` job steps)
- **Dev (watch compile):** `npm run dev` — `tsc --watch --preserveWatchOutput` (see `package.json` scripts)
- **Dev (watch run):** `npm run dev:run` — `node --env-file=.env --watch dist/index.js` (see `package.json` scripts)
- **Build:** `npm run build` — runs `node scripts/tasks.mjs build` (clean → `tsc -p tsconfig.build.json` → copy assets → `chmod 755 dist/index.js`) (see `scripts/tasks.mjs`, `package.json`)
- **Type-check:** `npm run type-check` — runs `node scripts/tasks.mjs type-check` which type-checks both `src/` (via `tsconfig.json`) and `tests/` (via `tsconfig.test.json`) with `--noEmit` (see `scripts/tasks.mjs` `CONFIG.commands`)
- **Test:** `npm test` — runs `node scripts/tasks.mjs test` which does a full build first then executes `node --test --import tsx/esm` on `src/__tests__/**/*.test.ts tests/**/*.test.ts` (see `scripts/tasks.mjs`); `npm run test:fast` — skips the build step
- **Coverage:** `npm run test:coverage` — same as `npm test` but adds `--experimental-test-coverage` (see `scripts/tasks.mjs`)
- **Lint:** `npm run lint` — `eslint .` (see `package.json`); `npm run lint:fix` — `eslint . --fix`
- **Format:** `npm run format` — `prettier --write .` (see `package.json`)
- **Inspect:** `npm run inspector` — builds then runs MCP Inspector (see `package.json`)
- **Dead code:** `npm run knip` — checks for unused exports/dependencies (see `package.json`)

## 4) Coding Standards (Style & Patterns)

- **Naming:** camelCase default, PascalCase for types/interfaces/classes/enums, UPPER_CASE for constants — enforced via `@typescript-eslint/naming-convention` (see `eslint.config.mjs`)
- **Structure:** Business logic in `src/lib/`; each tool in its own file under `src/tools/` exporting a single `register*Tool` function registered via `TOOL_REGISTRARS` array in `src/tools/index.ts`; schemas separated from tool logic in `src/schemas/` (observed in `src/tools/index.ts`, `src/tools/inspect-code-quality.ts`)
- **Typing/Strictness:** TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules` enabled (see `tsconfig.json`). `@typescript-eslint/no-explicit-any: 'error'` enforced (see `eslint.config.mjs`).
- **Imports:** Type-only imports enforced via `@typescript-eslint/consistent-type-imports` (see `eslint.config.mjs`). `.js` extensions required for local imports (NodeNext module resolution, see `tsconfig.json`). Import order sorted by `@trivago/prettier-plugin-sort-imports` following the order in `.prettierrc`.
- **Exports:** Named exports only, no default exports. Explicit return types required on exported functions via `@typescript-eslint/explicit-function-return-type` (see `eslint.config.mjs`).
- **Formatting:** Prettier with single quotes, trailing commas (es5), 2-space indent, LF line endings (see `.prettierrc`).
- **Patterns Observed:**
  - **Tool Factory pattern:** Tools use `registerStructuredToolTask()` (for Gemini tasks) or `wrapToolHandler()` (for simple tools) to ensure standardized progress reporting and error handling — observed in `src/lib/tool-factory.ts`, used by all tools in `src/tools/`
  - **Canonical typed tool contracts:** `TOOL_CONTRACTS` constant in `src/lib/tool-contracts.ts` is the single source of truth for model, timeout, maxOutputTokens, thinkingBudget, and parameter constraints per tool; consumed by `src/resources/instructions.ts` and individual tool files via `requireToolContract()`
  - **Zod `z.strictObject()` for all schemas:** Rejects unknown keys at validation boundary — observed in `src/schemas/inputs.ts`, `src/schemas/outputs.ts`
  - **Dual output (`content` + `structuredContent`):** Every tool response includes both JSON text and structured content for backward compatibility — observed in `src/lib/tool-response.ts`
  - **Cached env config:** `createCachedEnvInt()` pattern for lazy-evaluated, cached environment variable parsing — observed in `src/lib/env-config.ts`, used by `src/lib/diff-budget.ts`, `src/lib/context-budget.ts`, `src/lib/gemini.ts`
  - **Error classification:** Errors are classified by kind (validation/budget/upstream/timeout/cancelled/internal) with retryability metadata — observed in `src/lib/tool-factory.ts`, `src/lib/tool-response.ts`
  - **Concurrency guard:** `waitForConcurrencySlot()` enforces `MAX_CONCURRENT_CALLS` (default 10) before each Gemini call — observed in `src/lib/gemini.ts`
  - **AsyncLocalStorage for request context:** `requestId` and `model` are stored per-request for structured logging — observed in `src/lib/gemini.ts`

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating `package.json` and running `npm install` to regenerate `package-lock.json`. (see `package-lock.json` present)
- Do not edit `package-lock.json` manually. (see `package-lock.json` presence)
- Do not commit secrets; never print `.env` values; use `process.env` with existing `env-config.ts` mechanisms. API keys read from `GEMINI_API_KEY` or `GOOGLE_API_KEY` at runtime only (see `src/lib/gemini.ts`).
- Do not use default exports; use named exports only. (see `eslint.config.mjs` and codebase convention)
- Do not use `any`; `@typescript-eslint/no-explicit-any` is set to `'error'`. (see `eslint.config.mjs`)
- Do not write to `stdout` in server code — it corrupts JSON-RPC over stdio. Use `console.error()` for fatal errors or MCP `server.sendLoggingMessage()` for diagnostic logging. (see `src/index.ts`, `src/lib/tool-factory.ts`)
- Do not remove the shebang line `#!/usr/bin/env node` from `src/index.ts`. (see `src/index.ts` first line; binary exposed via `package.json` `bin`)
- Do not use Zod v3 APIs; the project uses Zod v4 (`z.strictObject()`, `z.toJSONSchema()`). (see `package.json` `zod: "^4.3.6"`)
- Do not add tools without registering them in `src/tools/index.ts` via the `TOOL_REGISTRARS` array. (see `src/tools/index.ts`)
- Do not add new tool model/timeout/budget configuration inline in tool files; update `src/lib/tool-contracts.ts` and consume it via `requireToolContract()`. (see `src/tools/inspect-code-quality.ts`, `src/lib/tool-contracts.ts`)
- Do not skip `validateDiffBudget()` before building prompts; diffs exceeding `MAX_DIFF_CHARS` (default 120,000) must be rejected at the tool boundary. (see `src/lib/diff-budget.ts`)
- Do not disable or bypass existing lint/type rules without explicit approval. (see `eslint.config.mjs`, `tsconfig.json`)
- Do not bump `package.json` and `server.json` versions independently — they must stay in sync (see `.github/workflows/release.yml` `Bump package.json & server.json` step).

## 6) Testing Strategy (Verified)

- **Framework:** `node:test` (Node.js built-in test runner) with `tsx/esm` loader for TypeScript (see `scripts/tasks.mjs` `detectTestLoader()`, `package.json` `test:fast` script)
- **Where tests live:** `tests/` directory (primary); `src/__tests__/` (searched by runner but directory does not currently exist in tree). Pattern: `*.test.ts` (see `scripts/tasks.mjs` `CONFIG.test.patterns`)
- **Approach:** Unit/integration tests with `node:assert/strict`. Core patterns observed in `tests/tool-task-lifecycle.test.ts`:
  - Mock the Gemini client via `setClientForTesting()` to avoid live API calls
  - Create real `McpServer` + `Client` pairs over `InMemoryTransport` for end-to-end MCP task lifecycle tests
  - Assert progress lifecycle: monotonic progress, `[starting]` first message, terminal `• outcome` last message
  - Assert budget enforcement via env vars (`MAX_DIFF_CHARS`, `MAX_CONTEXT_CHARS`) + cache reset helpers
  - Assert schema validation (`z.strictObject` rejects unknown input fields at the MCP boundary)
- **Running tests:** `npm test` triggers a full build before running (`scripts/tasks.mjs test`); `npm run test:fast` skips the build step
- **Integration tests:** `tests/gemini.integration.test.ts` exists (requires live API key; likely skipped in CI unless `GEMINI_API_KEY` is set)
- **Coverage:** `npm run test:coverage` uses `--experimental-test-coverage` (see `scripts/tasks.mjs`)

## 7) Common Pitfalls (Verified Only)

- **Diff budget enforcement:** Diffs exceeding `MAX_DIFF_CHARS` (default 120,000 chars) are rejected before reaching the Gemini API. Always call `validateDiffBudget()` inside `validateInput` before building prompts. (see `src/lib/diff-budget.ts`, `src/tools/analyze-pr-impact.ts`)
- **Context budget enforcement:** Combined diff + file context exceeding `MAX_CONTEXT_CHARS` (default 500,000 chars) is rejected. Call `validateContextBudget()` as well when `files` input is accepted. (see `src/lib/context-budget.ts`, `src/tools/inspect-code-quality.ts`)
- **Gemini schema constraint stripping:** JSON Schema constraints (`minLength`, `maxLength`, `minimum`, `maximum`, etc.) are stripped before passing to Gemini via `stripJsonSchemaConstraints()`. The strict Zod result schema validates _after_ Gemini returns. Do not rely on Gemini to enforce value bounds. (see `src/lib/gemini-schema.ts`)
- **Schema retry loop:** If Zod validation of the Gemini response fails, `tool-factory.ts` retries once with the error message appended to the prompt (`CRITICAL: The previous response failed schema validation. Error: ...`). `MAX_SCHEMA_RETRIES = 1`. (see `src/lib/tool-factory.ts`)
- **Build required before `npm test`:** The default `npm test` task runs a full clean build first. Use `npm run test:fast` to skip the build when iterating on test changes. (see `scripts/tasks.mjs`)
- **Env var caching:** `createCachedEnvInt()` caches parsed values on first access. In tests that mutate `process.env`, always call the corresponding `reset*CacheForTesting()` helper in the `finally` block to avoid cross-test contamination. (see `src/lib/env-config.ts`, `tests/tool-task-lifecycle.test.ts`)
- **CLI arg overrides:** `--model` and `--max-diff-chars` CLI flags (parsed in `src/index.ts`) set the corresponding `GEMINI_MODEL` / `MAX_DIFF_CHARS` env vars _before_ the server starts. Cached env configs will pick these up on first access. (see `src/index.ts`)
- **Concurrency limit:** `MAX_CONCURRENT_CALLS` (default 10) caps simultaneous Gemini calls; callers that exceed it and wait longer than `MAX_CONCURRENT_CALLS_WAIT_MS` (default 2,000 ms) receive an error. Keep integration/load tests aware of this. (see `src/lib/gemini.ts`)

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
- If a new critical path or pattern is discovered, add it to the relevant section with evidence.
- If a new tool is added, update `src/lib/tool-contracts.ts`, `src/tools/index.ts` (`TOOL_REGISTRARS`), and this file's repository map.
