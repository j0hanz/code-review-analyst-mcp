# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** MCP server that analyzes pull request diffs and returns structured review outputs (`review_diff`, `risk_score`, `suggest_patch`) (see `README.md`, `src/tools/index.ts`, `package.json`).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript (toolchain and sources) (see `package.json`, `tsconfig.json`, `src/**/*.ts`, `tests/**/*.ts`), JavaScript for task runner (see `scripts/tasks.mjs`).
  - **Frameworks:** MCP TypeScript SDK and Node stdio transport (see `package.json`, `src/server.ts`, `src/index.ts`); Node built-in test runner (see `scripts/tasks.mjs`, `tests/review-diff.test.ts`).
  - **Key Libraries:** `@modelcontextprotocol/sdk`, `@google/genai`, `zod`, `zod-to-json-schema` (see `package.json`), plus ESLint/Prettier/TypeScript toolchain (see `package.json`, `eslint.config.mjs`, `.prettierrc`).
- **Architecture:** Single-package MCP server with composition root in `createServer()`, modular tool/resource/prompt registration, shared library utilities, and schema-driven IO validation (see `src/server.ts`, `src/tools/index.ts`, `src/resources/index.ts`, `src/prompts/index.ts`, `src/schemas/inputs.ts`, `src/schemas/outputs.ts`).

## 2) Repository Map (High-Level)

- `src/`: Runtime server code (entrypoint, server wiring, tools, schemas, prompts/resources, shared libs) (see `src/index.ts`, `src/server.ts`, `src/tools/`, `src/lib/`).
- `tests/`: Node test runner suites for schema/tool registration and Gemini integration behavior (see `tests/review-diff.test.ts`, `tests/gemini.integration.test.ts`).
- `scripts/`: Build/type-check/test orchestration via `tasks.mjs` (see `scripts/tasks.mjs`).
- `.github/`: Prompt/instruction metadata for agent workflows; `.github/workflows/` exists but currently contains no workflow files (see `.github/`, `.github/prompts/`, `.github/instructions/`, `.github/workflows/`).
  > Ignore generated/vendor dirs like `dist/`, `build/`, `node_modules/`, `.venv/`, `__pycache__/`.

## 3) Operational Commands (Verified)

- **Environment:** Node.js `>=24` required by manifest engines (see `package.json`). README lists `>=20` and is inconsistent with manifest (see `README.md`, `package.json`).
- **Install:** `npm install` (see `README.md`).
- **Dev:** `npm run dev` (tsc watch) and `npm run dev:run` (watch `dist/index.js` with `.env`) (see `README.md`, `package.json`).
- **Test:** `npm run test` (`node scripts/tasks.mjs test`) and `npm run test:fast` (`node --test --import tsx/esm ...`) (see `package.json`, `scripts/tasks.mjs`).
- **Build:** `npm run build` (`node scripts/tasks.mjs build`) (see `README.md`, `package.json`, `scripts/tasks.mjs`).
- **Lint/Format:** `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run type-check` (see `package.json`).
- **CI command source:** **UNVERIFIED** — no workflow files under `.github/workflows/`, so no CI steps are available as source-of-truth (see `.github/workflows/`).

## 4) Coding Standards (Style & Patterns)

- **Naming:** ESLint naming convention enforces camelCase for most symbols and PascalCase for type-like constructs (see `eslint.config.mjs`).
- **Structure:** Composition root creates `McpServer` and registers tools/resources/prompts; tool modules encapsulate prompt construction and schema-validated responses (see `src/server.ts`, `src/tools/review-diff.ts`).
- **Typing/Strictness:** TypeScript strict mode with `noUncheckedIndexedAccess`, `isolatedModules`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes` (see `tsconfig.json`).
- **Patterns Observed:**
  - Entrypoint + graceful shutdown + stdio transport wiring in `main()` (observed in `src/index.ts`).
  - Defensive parsing and explicit error wrapping for runtime metadata loading (observed in `src/server.ts`).
  - LLM adapter with retries, timeout aborts, and structured stderr observability logs (observed in `src/lib/gemini.ts`).
  - Tool returns strict structured JSON parsed by Zod before response emission (observed in `src/tools/review-diff.ts`, `src/schemas/outputs.ts`).

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating `package.json` and `package-lock.json` through package manager commands (see `package.json`, `package-lock.json`).
- Do not edit lockfiles manually (see `package-lock.json`).
- Do not commit secrets; never print API key values. Use environment variables (`GEMINI_API_KEY` / `GOOGLE_API_KEY`) only (see `README.md`, `src/lib/gemini.ts`).
- Do not change public tool contracts (`review_diff`, `risk_score`, `suggest_patch`) without updating tests/docs and schema expectations (see `README.md`, `src/tools/index.ts`, `tests/review-diff.test.ts`).
- Do not bypass lint/type constraints without explicit approval; rules enforce strict TS and style gates (see `eslint.config.mjs`, `tsconfig.json`).
- Do not rely on CI workflow assumptions in this repository until workflows are added (see `.github/workflows/`).

## 6) Testing Strategy (Verified)

- **Framework:** Node built-in test runner (`node:test`) with optional `tsx/esm` loader for TS tests (see `tests/review-diff.test.ts`, `tests/gemini.integration.test.ts`, `scripts/tasks.mjs`, `package.json`).
- **Where tests live:** `tests/**/*.test.ts` and optional `src/__tests__/**/*.test.ts` glob (see `scripts/tasks.mjs`, `package.json`).
- **Approach:**
  - Contract/schema tests and registration smoke checks for tool wiring (see `tests/review-diff.test.ts`).
  - Integration-style mocking of Gemini client via `node:test` mocks and dependency injection helper `setClientForTesting` (see `tests/gemini.integration.test.ts`, `src/lib/gemini.ts`).
  - No DB/container/service dependency evidence found for tests in current repo (see `scripts/tasks.mjs`, repository root files).

## 7) Common Pitfalls (Optional; Verified Only)

- Node version mismatch (`README` says `>=20`, manifest requires `>=24`) → treat `package.json` engines as authoritative for local/CI setup (see `README.md`, `package.json`).
- ESLint ignores tests and test globs by config → run test quality checks via `npm run test` rather than expecting lint coverage in `tests/` (see `eslint.config.mjs`, `package.json`, `scripts/tasks.mjs`).

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
- If a new critical path or pattern is discovered, add it to the relevant section with evidence.
