# AGENTS.md

Gemini-powered MCP server (`@j0hanz/code-review-analyst-mcp`) that accepts unified diffs and returns structured JSON for PR impact, code quality, test plans, and verbatim search/replace patches via stdio transport.

**Stack:** Node.js ≥ 24 · TypeScript 5.9 · ESM (`"type": "module"`) · Zod v4 · MCP SDK 1.26 · `@google/genai`

---

## Commands

```bash
# Build (tsc via tsconfig.build.json → dist/)
npm run build

# Type-check source only (no emit)
npm run type-check

# Type-check tests
npm run type-check:tests

# Lint
npm run lint

# Lint + auto-fix
npm run lint:fix

# Run all tests
npm test

# Run tests without coverage (faster)
npm run test:fast

# Run a single test file
node --test --import tsx/esm tests/<test-file>.test.ts

# Clean dist + build artifacts
npm run clean

# Watch mode (dev)
npm run dev

# Run built server with env file (dev)
npm run dev:run

# Launch MCP Inspector (build + open browser)
npm run inspector

# Detect unused exports/deps
npm run knip
```

---

## Safety and Permissions

### Always

- Run `npm run type-check` and `npm run lint` after any source change in `src/`.
- Run `npm test` after changing tool contracts, schemas, or Gemini call logic.
- Keep `src/lib/model-config.ts` as the single source of truth for model names, thinking levels, token budgets, and timeouts.
- Keep `src/lib/tool-contracts.ts` as the single source of truth for tool metadata; `tests/tool-contract-consistency.test.ts` validates it.
- Use `zod` v4 APIs only — `z.toJSONSchema()` (not `zod-to-json-schema`), `z.ZodType` (not `z.ZodTypeAny`).

### Ask first

- Changing `FLASH_MODEL` or `PRO_MODEL` identifiers in `model-config.ts` (affects all Gemini calls).
- Bumping `@modelcontextprotocol/sdk` major version (breaking MCP protocol changes).
- Altering the diff budget constants in `src/lib/diff-budget.ts` or diff size cap in `src/lib/diff-store.ts`.
- Running `npm run build` in CI or shared environments with a cold cache (slow).
- Adding/removing tool registrations in `src/tools/index.ts` (update contracts + docs in sync).
- Any change to `tsconfig.build.json` or `tsconfig.json` compiler flags.

### Never

- Commit `GEMINI_API_KEY` or `GOOGLE_API_KEY` values to source or `.env` committed to git.
- Edit files in `dist/` — they are generated; edit `src/` instead.
- Bypass `prepublishOnly` checks (`--ignore-scripts`) before publishing to npm.
- Add runtime dependencies without justification; keep the dependency surface minimal.
- Use `require()` or CommonJS patterns — this is a pure ESM package.

---

## Navigation

| Path                        | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `src/index.ts`              | Entry point — starts stdio MCP server                          |
| `src/server.ts`             | MCP `McpServer` wiring (tools, prompts, resources)             |
| `src/tools/`                | One file per tool (`generate-diff`, `analyze-pr-impact`, etc.) |
| `src/lib/model-config.ts`   | Model IDs, thinking levels, token budgets, timeouts            |
| `src/lib/tool-contracts.ts` | Canonical tool metadata (validated by tests)                   |
| `src/lib/tool-factory.ts`   | `wrapToolHandler` — shared handler wrapper with retry/progress |
| `src/lib/gemini.ts`         | Gemini API client + schema retry logic                         |
| `src/lib/diff-store.ts`     | In-memory diff cache (server-side diff state)                  |
| `src/schemas/inputs.ts`     | Zod input schemas for all tools                                |
| `src/schemas/outputs.ts`    | Zod output schemas for all tools                               |
| `src/resources/`            | MCP resource handlers (`instructions`, `tool-catalog`, etc.)   |
| `src/prompts/`              | MCP prompt handlers                                            |
| `tests/`                    | Node.js built-in test runner tests (`.test.ts`)                |
| `scripts/tasks.mjs`         | Build/test orchestration (called by `npm run *` scripts)       |

**Tool call sequence:** `generate_diff` (caches diff) → any analysis tool (reads cache → calls Gemini → validates Zod → returns structured JSON).

---

## Examples to Follow

### Good patterns (copy from here)

- `src/tools/analyze-pr-impact.ts` — canonical tool registration pattern with `wrapToolHandler`
- `src/lib/tool-factory.ts` — how to emit MCP progress notifications and handle task lifecycle
- `src/schemas/outputs.ts` — how to define Zod v4 output schemas with concise `.describe()` strings

### Avoid (legacy/do not copy)

- Any `zod-to-json-schema` import — replaced by `z.toJSONSchema()` (Zod v4 built-in)
- `z.ZodTypeAny` — deprecated; use `z.ZodType`
- CommonJS `require()` or `module.exports`

---

## PR / Change Checklist

- [ ] `npm run type-check` passes (zero errors)
- [ ] `npm run lint` passes (zero warnings)
- [ ] `npm test` passes (all tests green)
- [ ] If tool contract changed → `tool-contracts.ts` updated and `tool-contract-consistency.test.ts` still passes
- [ ] If new env var added → documented in `src/lib/env-config.ts` and README
- [ ] No secrets or API keys in source
- [ ] `dist/` not committed

---

## When Stuck

1. Ask one clarifying question about intent or scope.
2. Propose a minimal plan (≤ 3 steps) before making changes.
3. Avoid wide speculative edits across multiple systems; change one layer at a time.
4. Check `tests/tool-contract-consistency.test.ts` for the authoritative contract shape.
5. Check `src/lib/gemini.ts` for how schema validation retries work before touching Gemini call logic.
