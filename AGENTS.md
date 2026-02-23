# AGENTS.md

This repository is a Gemini-powered MCP server for pull request analysis, offering impact assessment, review summaries, and automated code inspection.

This project uses **npm**.

## Commands

- **Lint (File-scoped):** `npx eslint --fix <file>`
- **Format (File-scoped):** `npx prettier --write <file>`
- **Test (Fast):** `npm run test:fast` (runs tests without build)
- **Test (Full):** `npm run test` (builds + runs all tests)
- **Typecheck:** `npm run type-check`
- **Build:** `npm run build` (clean, compile, validate, copy)
- **Start:** `npm start` (runs `dist/index.js`)

## Do

- Follow **TypeScript 5.9+** strict conventions.
- Use `src/lib/gemini.ts` for all LLM interactions.
- Update `src/resources/instructions.ts` when modifying tool contracts.
- Prefer `npm run test:fast` for quick iteration.
- Keep diffs input to tools under `MAX_DIFF_CHARS` (default 120k).

## Don't

- **Don't** commit `.env` or expose `GEMINI_API_KEY`.
- **Don't** bypass strict type checks; fix the types.
- **Don't** modify `dist/` directly; it is a generated artifact.
- **Don't** introduce circular dependencies in `src/lib`.

## Safety and Permissions

- **Always:** Run `npm run lint` and `npm run type-check` before committing.
- **Ask first:** Before adding new dependencies, changing LLM model configs, or modifying GitHub Actions workflows.
- **Never:** Commit secrets, API keys, or vendor directories (`node_modules`, `dist`).

## Project Structure Hints

- `src/tools/` for MCP tool implementations (e.g., `analyze_pr_impact.ts`).
- `src/lib/` for shared logic (Gemini client, diff parsing, tool contracts).
- `src/resources/` for static resources and internal documentation strings.
- `tests/` for test files (integration and unit tests).
- `scripts/` for build and maintenance tasks.

## Examples to Follow

- See `src/tools/analyze-pr-impact.ts` for a standard tool implementation pattern.
- See `src/lib/gemini.ts` for correct Gemini API usage.
- See `tests/gemini.integration.test.ts` for integration testing patterns.

## PR / Change Checklist

- [ ] Run `npm run type-check` to ensure no regressions.
- [ ] Run `npm run lint` to enforce style.
- [ ] Verify that new tools are added to `src/tools/index.ts` and `src/resources/instructions.ts`.
- [ ] If changing schemas, update `src/schemas/`.

## When Stuck

- Review `src/lib/tool-contracts.ts` for tool definitions.
- Ask for clarification on Gemini model constraints if prompt engineering is required.
