# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** Gemini-powered MCP server for automated code review analysis — accepts unified diffs and returns structured findings, risk scores, impact analysis, test plans, and search/replace fixes (see `package.json` description, `server.json`).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9+ (see `devDependencies` in `package.json`), Node.js ≥24 (see `engines` in `package.json`)
  - **Frameworks:** `@modelcontextprotocol/sdk` v1.26+ (see `dependencies` in `package.json`)
  - **Key Libraries:**
    - `@google/genai` ^1.42.0 — Gemini Developer API client (see `package.json`)
    - `zod` ^4.3.6 — schema validation (see `package.json`)
    - `parse-diff` ^0.11.1 — unified diff parsing (see `package.json`)
- **Architecture:** Single-package MCP server using stdio transport. Tools are registered via a factory pattern (`registerStructuredToolTask`) that wires Zod input validation → prompt building → Gemini structured JSON generation → Zod output parsing → MCP response with both `content` and `structuredContent`. Supports MCP task lifecycle with `InMemoryTaskStore` (see `src/server.ts`, `src/lib/tool-factory.ts`).

## 2) Repository Map (High-Level)

- `src/` — Main source code (see `tsconfig.json` `rootDir`)
  - `src/index.ts` — CLI entrypoint with shebang, stdio transport, shutdown handlers
  - `src/server.ts` — `McpServer` creation, capability declaration, registration orchestration
  - `src/tools/` — One file per tool, each exports a `register*Tool(server)` function
  - `src/schemas/` — Zod input/output schemas (`inputs.ts`, `outputs.ts`)
  - `src/lib/` — Shared utilities: Gemini client, tool factory, error helpers, diff parsing, budget validation
  - `src/prompts/` — MCP prompt registration (`get-help`, `review-guide`)
  - `src/resources/` — MCP resource registration (`internal://instructions`)
  - `src/instructions.md` — Server instructions (copied to `dist/` at build time)
- `tests/` — Test files using `node:test` (see `tsconfig.test.json`, `scripts/tasks.mjs`)
- `scripts/tasks.mjs` — Custom build orchestrator (clean, compile, validate, copy assets, test runner)
- `.github/workflows/release.yml` — Release CI: lint, type-check, test, build, publish to npm/Docker/MCP Registry

## 3) Operational Commands (Verified)

- **Environment:** Node.js ≥24, npm (see `package.json` `engines`, `package-lock.json` present)
- **Install:** `npm ci` (see `.github/workflows/release.yml` line 83)
- **Dev:** `npm run dev` — `tsc --watch` (see `package.json` scripts); `npm run dev:run` — runs built server with `--env-file=.env --watch`
- **Test:** `npm test` — runs `node scripts/tasks.mjs test` which does a full build then `node --test --import tsx/esm` on `src/__tests__/**/*.test.ts tests/**/*.test.ts` (see `scripts/tasks.mjs`); `npm run test:fast` — skips build
- **Build:** `npm run build` — runs `node scripts/tasks.mjs build` (clean → tsc → validate instructions → copy assets → chmod) (see `scripts/tasks.mjs`, `package.json`)
- **Lint:** `npm run lint` — `eslint .` (see `package.json`); `npm run lint:fix` — `eslint . --fix`
- **Format:** `npm run format` — `prettier --write .` (see `package.json`)
- **Type-check:** `npm run type-check` — `tsc -p tsconfig.json --noEmit` (see `package.json`, `scripts/tasks.mjs`)
- **Inspect:** `npm run inspector` — builds then runs MCP Inspector (see `package.json`)

## 4) Coding Standards (Style & Patterns)

- **Naming:** camelCase default, PascalCase for types/enums, UPPER_CASE for constants — enforced via `@typescript-eslint/naming-convention` (see `eslint.config.mjs`)
- **Structure:** Business logic in `src/lib/`; each tool in its own file under `src/tools/` exporting a single `register*Tool` function; schemas separated from tool logic in `src/schemas/` (observed in `src/tools/index.ts`, `src/tools/inspect-code-quality.ts`)
- **Typing/Strictness:** TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules` enabled (see `tsconfig.json`). `@typescript-eslint/no-explicit-any: error` enforced (see `eslint.config.mjs`).
- **Imports:** Type-only imports enforced via `@typescript-eslint/consistent-type-imports` (see `eslint.config.mjs`). `.js` extensions required for local imports (NodeNext module resolution, see `tsconfig.json`). Import order sorted by Prettier plugin `@trivago/prettier-plugin-sort-imports` (see `.prettierrc`).
- **Exports:** Named exports only, no default exports. Explicit return types required on exported functions via `@typescript-eslint/explicit-function-return-type` (see `eslint.config.mjs`).
- **Patterns Observed:**
  - **Tool Factory pattern:** All tools use `registerStructuredToolTask()` which handles input validation, prompt building, Gemini call with retries, output parsing, progress reporting, and MCP task lifecycle — observed in `src/lib/tool-factory.ts`, used by all tools in `src/tools/`
  - **Zod `z.strictObject()` for all schemas:** Rejects unknown keys at validation boundary — observed in `src/schemas/inputs.ts`, `src/schemas/outputs.ts`
  - **Dual output (`content` + `structuredContent`):** Every tool response includes both JSON text and structured content for backward compatibility — observed in `src/lib/tool-response.ts`
  - **Cached env config:** `createCachedEnvInt()` pattern for lazy-evaluated, cached environment variable parsing — observed in `src/lib/env-config.ts`, used by `src/lib/diff-budget.ts`, `src/lib/gemini.ts`
  - **Error classification:** Errors are classified by kind (validation/budget/upstream/timeout/cancelled/internal) with retryability metadata — observed in `src/lib/tool-factory.ts`, `src/lib/tool-response.ts`
- **Formatting:** Prettier with single quotes, trailing commas (es5), 2-space indent, LF line endings (see `.prettierrc`)

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating `package.json` and running `npm install` to regenerate `package-lock.json`. (see `package-lock.json` present)
- Do not edit `package-lock.json` manually. (see `package-lock.json` presence)
- Do not commit secrets; never print `.env` values; use `process.env` with existing `env-config.ts` mechanisms. API keys read from `GEMINI_API_KEY` or `GOOGLE_API_KEY` at runtime only (see `src/lib/gemini.ts`).
- Do not use default exports; use named exports only. (see `eslint.config.mjs` and codebase convention)
- Do not use `any`; `@typescript-eslint/no-explicit-any` is set to `error`. (see `eslint.config.mjs`)
- Do not write to `stdout` in server code — it corrupts JSON-RPC over stdio. Use `console.error()` or MCP logging. (see `src/index.ts` using stderr for fatal errors)
- Do not disable or bypass existing lint/type rules without explicit approval. (see `eslint.config.mjs`, `tsconfig.json`)
- Do not skip the shebang line `#!/usr/bin/env node` in `src/index.ts`. (see `src/index.ts` first line; binary exposed via `package.json` `bin`)
- Do not use Zod v3 APIs; the project uses Zod v4 (`z.strictObject`, `z.toJSONSchema`). (see `package.json` `zod: ^4.3.6`)
- Do not add tools without registering them in `src/tools/index.ts` via the `TOOL_REGISTRARS` array.

## 6) Testing Strategy (Verified)

- **Framework:** `node:test` (Node.js built-in test runner) with `tsx/esm` loader for TypeScript (see `scripts/tasks.mjs`, `package.json` `test:fast` script)
- **Where tests live:** `tests/` directory and `src/__tests__/` (see `scripts/tasks.mjs` `CONFIG.test.patterns`, `tsconfig.test.json`)
- **Approach:** Unit tests with `node:assert/strict`; test files follow `*.test.ts` naming convention. Tests cover diff parsing, schema validation, Gemini integration (with mock via `setClientForTesting`), server discovery, and task lifecycle (see `tests/diff-parser.test.ts`, `tests/server-discovery.test.ts`, `tests/tool-task-lifecycle.test.ts`)
- **Running tests:** `npm test` triggers a full build before running tests; `npm run test:fast` skips the build step
- **Coverage:** `npm run test:coverage` uses `--experimental-test-coverage` (see `scripts/tasks.mjs`)

## 7) Common Pitfalls (Verified Only)

- **Diff budget enforcement:** Diffs exceeding `MAX_DIFF_CHARS` (default 120,000) are rejected before reaching the Gemini API. Always call `validateDiffBudget()` before generating prompts. (see `src/lib/diff-budget.ts`)
- **Context budget enforcement:** Combined diff + file context exceeding `MAX_CONTEXT_CHARS` (default 500,000) is rejected. (see `src/lib/context-budget.ts`)
- **Gemini schema constraints:** JSON Schema constraints (`minLength`, `maxLength`, `minimum`, `maximum`, etc.) are stripped before passing to Gemini via `stripJsonSchemaConstraints()`. The strict Zod result schema validates after Gemini returns. Do not rely on Gemini enforcing bounds. (see `src/lib/gemini-schema.ts`)
- **Build required before `npm test`:** The default `npm test` task runs a full build first. Use `npm run test:fast` to skip. (see `scripts/tasks.mjs`)

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
- If a new critical path or pattern is discovered, add it to the relevant section with evidence.
