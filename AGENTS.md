# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** Gemini-powered MCP server for pull request code review analysis with structured outputs for findings, release risk scoring, and focused patch suggestions (see `README.md`, `package.json#description`).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9+ (see `package.json` devDependencies `"typescript": "^5.9.3"`), Node.js >=24 (see `package.json#engines`)
  - **Frameworks:** `@modelcontextprotocol/sdk` v1.26+ (see `package.json` dependencies), stdio transport (see `src/index.ts`)
  - **Key Libraries:**
    - `@google/genai` ^1.41.0 — Gemini API client (see `package.json`)
    - `zod` ^3.24.1 — Schema validation for inputs/outputs (see `package.json`)
    - `zod-to-json-schema` ^3.25.1 — Converts Zod schemas to JSON Schema for Gemini response schema (see `package.json`)
    - `tsx` ^4.21.0 — TypeScript execution for tests (see `package.json` devDependencies)
- **Architecture:** Single-package MCP server using a layered module structure: entrypoint → server → tools/resources/prompts → lib (shared adapters, schemas, helpers). One tool per file, one schema file for inputs and one for outputs, shared Gemini adapter with retry/timeout logic (see `src/` tree).

## 2) Repository Map (High-Level)

- `src/` — Main source root (see `tsconfig.json#rootDir`)
  - `src/index.ts` — CLI entrypoint with shebang, stdio transport wiring, signal shutdown handlers
  - `src/server.ts` — `McpServer` instance creation, capability declaration, version loading, instructions loading
  - `src/tools/` — Tool implementations, one file per tool (`review-diff.ts`, `risk-score.ts`, `suggest-patch.ts`), plus `index.ts` registrar
  - `src/schemas/` — Zod schemas: `inputs.ts` (tool input validation), `outputs.ts` (tool result + Gemini response schemas)
  - `src/lib/` — Shared infrastructure: `gemini.ts` (API adapter with retry/timeout), `tool-factory.ts` (generic tool-task registrar), `tool-response.ts` (response helpers), `errors.ts` (error extraction), `diff-budget.ts` (diff size guard), `types.ts` (shared type definitions)
  - `src/resources/` — MCP resource registration (`internal://instructions`)
  - `src/prompts/` — MCP prompt registration (`get-help`)
  - `src/instructions.md` — Server usage guide bundled into `dist/` and served as a resource
- `tests/` — Test files for tool schemas and server discovery (`node:test` runner)
- `scripts/` — Build/test task runner (`tasks.mjs`)
- `.github/` — Workflows directory (currently empty)

> Ignore: `dist/`, `node_modules/`, `coverage/`, `.cache/`, `.tsbuildinfo`

## 3) Operational Commands (Verified)

- **Environment:** Node.js >=24, npm (see `package.json#engines`, `package-lock.json` present)
- **Install:** `npm install` (see `README.md` "Development" section)
- **Dev:** `npm run dev` → `tsc --watch --preserveWatchOutput` (see `package.json#scripts.dev`)
- **Dev run:** `npm run dev:run` → `node --env-file=.env --watch dist/index.js` (see `package.json#scripts.dev:run`)
- **Build:** `npm run build` → `node scripts/tasks.mjs build` — cleans, compiles via `tsc -p tsconfig.build.json`, validates `instructions.md`, copies assets, sets executable bit (see `package.json#scripts.build`, `scripts/tasks.mjs`)
- **Test:** `npm test` → `node scripts/tasks.mjs test` — runs full build first, then `node --test --import tsx/esm` on `tests/**/*.test.ts` (see `package.json#scripts.test`, `scripts/tasks.mjs`)
- **Test (fast, no build):** `npm run test:fast` → `node --test --import tsx/esm src/__tests__/**/*.test.ts tests/**/*.test.ts` (see `package.json#scripts.test:fast`)
- **Type-check:** `npm run type-check` → `node scripts/tasks.mjs type-check` → `tsc -p tsconfig.json --noEmit` (see `package.json#scripts.type-check`)
- **Lint:** `npm run lint` → `eslint .` (see `package.json#scripts.lint`)
- **Lint fix:** `npm run lint:fix` → `eslint . --fix` (see `package.json#scripts.lint:fix`)
- **Format:** `npm run format` → `prettier --write .` (see `package.json#scripts.format`)
- **Inspector:** `npm run inspector` → builds then runs `npx @modelcontextprotocol/inspector node dist/index.js` (see `package.json#scripts.inspector`)

## 4) Coding Standards (Style & Patterns)

- **Naming:** camelCase for variables/functions, PascalCase for types/interfaces/enums, UPPER_CASE for constants. Enforced via `@typescript-eslint/naming-convention` (see `eslint.config.mjs`).
- **Imports:** Type-only imports required (`import type { X }`) enforced via `@typescript-eslint/consistent-type-imports` (see `eslint.config.mjs`). Import order sorted by Prettier plugin `@trivago/prettier-plugin-sort-imports` with groups: node builtins → MCP SDK → zod → third-party → local (see `.prettierrc`). `.js` extensions used in local imports for NodeNext resolution (observed in all `src/` files).
- **Exports:** Named exports only, no default exports (observed across all modules). Explicit return types on exported functions enforced via `@typescript-eslint/explicit-function-return-type` (see `eslint.config.mjs`).
- **Structure:** Business logic lives in `src/tools/*.ts` (one tool per file). Shared infrastructure in `src/lib/`. Schemas separated into `src/schemas/inputs.ts` and `src/schemas/outputs.ts`. Each tool uses the generic `registerStructuredToolTask` factory from `src/lib/tool-factory.ts`.
- **Typing/Strictness:** TypeScript `strict: true` with additional flags: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` (see `tsconfig.json`). ESLint extends `tseslint.configs.strictTypeChecked` and `tseslint.configs.stylisticTypeChecked` (see `eslint.config.mjs`).
- **Schemas:** All object schemas use `z.strictObject()` (rejects unknown fields). All parameters have `.describe()` annotations and explicit bounds (`.min()`, `.max()`). Observed in `src/schemas/inputs.ts` and `src/schemas/outputs.ts`.
- **Error Handling:** Errors caught as `unknown`, extracted via `getErrorMessage()` helper (see `src/lib/errors.ts`). Tool errors returned via `createErrorToolResponse(code, message)` with `isError: true` (see `src/lib/tool-response.ts`). Uncaught exceptions avoided in tool handlers (see `src/lib/tool-factory.ts`).
- **Patterns Observed:**
  - Generic tool-task factory pattern: all three tools use the same `registerStructuredToolTask<TInput>()` abstraction with config objects (observed in `src/tools/review-diff.ts`, `src/tools/risk-score.ts`, `src/tools/suggest-patch.ts`)
  - Dual content output: every tool response includes both `content` (JSON text) and `structuredContent` for backward compatibility (observed in `src/lib/tool-response.ts`)
  - Gemini adapter with retry + exponential backoff + jitter + timeout + abort signal propagation (observed in `src/lib/gemini.ts`)
  - `maxOutputTokens` capped at 16,384 by default to prevent unbounded Gemini responses (observed in `src/lib/gemini.ts`)
  - AsyncLocalStorage for per-request context (request ID, model) in Gemini calls (observed in `src/lib/gemini.ts`)
  - Diff budget guard applied before Gemini calls via `validateDiffBudget()` (observed in `src/lib/diff-budget.ts`, used in all tools)
- **Formatting:** Prettier with: single quotes, semicolons, trailing commas (es5), 2-space indent, 80 char print width, LF line endings (see `.prettierrc`).

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without running `npm install` to update `package-lock.json` (see `package-lock.json` presence, `package.json`).
- Do not edit `package-lock.json` manually (see lockfile presence).
- Do not commit secrets; never print `.env` values or API keys. The repo uses `GEMINI_API_KEY`/`GOOGLE_API_KEY` env vars and `.env` is gitignored (see `.gitignore`).
- Do not write to `stdout` in server code — it corrupts JSON-RPC over stdio. Use `console.error()` for logging (see `src/lib/gemini.ts` logging pattern, `.github/instructions/typescript-mcp-server.instructions.md` rule).
- Do not use default exports; use named exports only (see `eslint.config.mjs`, observed convention throughout `src/`).
- Do not use `any` type — `@typescript-eslint/no-explicit-any: 'error'` is enforced (see `eslint.config.mjs`).
- Do not use `z.object()`; use `z.strictObject()` for all schemas (see `.github/instructions/typescript-mcp-server.instructions.md`, observed in `src/schemas/`).
- Do not disable or bypass existing lint/type rules without explicit approval (see `eslint.config.mjs`, `tsconfig.json`).
- Do not change public tool APIs (`review_diff`, `risk_score`, `suggest_patch`) without updating `README.md`, `src/instructions.md`, schemas, and tests.
- Do not omit `.js` extensions in local imports — required for NodeNext module resolution (see `tsconfig.json#module`, observed in all source files).
- Do not omit `.describe()` on Zod schema fields — required for LLM parameter guidance (see `.github/instructions/typescript-mcp-server.instructions.md`).

## 6) Testing Strategy (Verified)

- **Framework:** Node.js built-in `node:test` runner with `tsx/esm` loader for TypeScript (see `package.json#scripts.test`, `scripts/tasks.mjs`, test file imports).
- **Assertions:** `node:assert/strict` (observed in all test files).
- **Where tests live:**
  - `tests/` — Primary test directory (see `scripts/tasks.mjs` test patterns: `tests/**/*.test.ts`)
  - `src/__tests__/` — Additional test location (pattern configured but directory currently empty)
- **Test files:**
  - `tests/review-diff.test.ts` — Tool registration smoke test, input schema rejection of unknown fields, output schema validation, Gemini schema compatibility, JSON Schema conversion
  - `tests/risk-score.test.ts` — Risk score schema validation tests
  - `tests/suggest-patch.test.ts` — Patch suggestion schema validation tests
  - `tests/server-discovery.test.ts` — Integration tests using `InMemoryTransport` client/server pairs: resource discoverability, resource content reading, prompt discoverability, prompt content
  - `tests/gemini.integration.test.ts` — Gemini adapter integration tests
- **Approach:** Unit tests for schema validation (parse/safeParse), smoke tests for tool registration, integration tests for MCP server discovery using in-memory transport (no external services required for unit/integration tests). No mocking framework — tests use direct schema validation and `InMemoryTransport` from MCP SDK.
- **Running single test files:** `node --test --import tsx/esm tests/<file>.test.ts`

## 7) Common Pitfalls (Verified Only)

- Forgetting the shebang `#!/usr/bin/env node` as the first line of `src/index.ts` breaks `npx` execution (see `src/index.ts` line 1, `.github/instructions/typescript-mcp-server.instructions.md`).
- Omitting `.js` extensions in local imports causes `ERR_MODULE_NOT_FOUND` at runtime under NodeNext resolution (see `tsconfig.json#module: "NodeNext"`).
- Using `z.object()` instead of `z.strictObject()` allows unexpected fields through; all schemas must reject unknown keys (see `src/schemas/inputs.ts`, `src/schemas/outputs.ts`).
- The `npm test` command runs a full build before tests (`scripts/tasks.mjs` → `Pipeline.fullBuild()` → test); use `npm run test:fast` to skip rebuild during iteration.
- Writing to `stdout` in library code (e.g., `console.log()`) corrupts the stdio JSON-RPC stream; always use `console.error()` (see `src/lib/gemini.ts`).
- Diff inputs exceeding `MAX_DIFF_CHARS` (default 120,000) are rejected before reaching Gemini with `E_INPUT_TOO_LARGE` (see `src/lib/diff-budget.ts`).

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
- If a new critical path or pattern is discovered, add it to the relevant section with evidence.
- If a new tool is added, add a corresponding file in `src/tools/`, register it in `src/tools/index.ts`, add schemas in `src/schemas/`, add tests in `tests/`, and update `README.md` and `src/instructions.md`.
