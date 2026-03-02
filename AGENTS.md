# AGENTS.md

Gemini-powered MCP server for code analysis with structured outputs for findings, risk assessment, and focused patch suggestions.

## Tooling

- **Manager**: npm
- **Runtime**: Node.js >= 24
- **Language**: TypeScript 5.x, compiled to ESM (`dist/`)
- **Framework**: `@modelcontextprotocol/sdk` (MCP server)
- **LLM**: `@google/genai` (Gemini)
- **Schema validation**: Zod v4
- **Linting**: ESLint 10 + `typescript-eslint`
- **Formatting**: Prettier
- **Dead-code detection**: Knip
- **Container**: Docker / Docker Compose

## Commands

- **Build**: `npm run build`
- **Type-check**: `npm run type-check`
- **Test**: `npm run test`
- **Lint**: `npm run lint`
- **Format**: `npm run format`
- **Dev (watch)**: `npm run dev`
- **Run built server**: `npm run start`
- **MCP Inspector**: `npm run inspector`
- **Dead-code check**: `npm run knip`

## Safety Boundaries

- **Always run before committing**: `npm run lint`, `npm run type-check`, `npm run test`
- **Ask first**: installing / removing dependencies, deleting files, running coverage suites, deploy or infrastructure changes, `git push`
- **Never**: commit or expose secrets/credentials (`.env` contains API keys); edit generated directories (`dist/`, `node_modules/`, `.git/`); trigger releases (`npm publish`, `gh release create`) without approval

## Directory Overview

```text
.
├── .github/            # CI/workflows and repo automation
├── .vscode/
├── memory_db/
├── scripts/            # automation scripts
├── src/                # application source
├── tests/              # test suites
├── .prettierignore     # formatter config
├── .prettierrc         # formatter config
├── docker-compose.yml  # local container orchestration
├── Dockerfile          # container image build
├── eslint.config.mjs   # lint config
├── package.json        # scripts and dependencies
├── README.md           # usage and setup docs
├── server.json         # published server metadata
├── tsconfig.build.json # TypeScript config
└── tsconfig.json       # TypeScript config
└── ...                # 1 more top-level items omitted
```

## Navigation

- **Entry Points**: `src/index.ts` (MCP server entry), `src/server.ts` (server setup)
- **Tools**: `src/tools/` — one file per MCP tool
- **Schemas**: `src/schemas/` — Zod input/output schemas shared across tools
- **Resources / Prompts**: `src/resources/`, `src/prompts/`
- **Shared lib**: `src/lib/` — Gemini client, diff parsing, config, errors, concurrency
- **Tests**: `tests/` — node:test, file-per-concern
- **Build scripts**: `scripts/tasks.mjs`
- **Server metadata**: `server.json`
- **Key Configs**: `tsconfig.json`, `tsconfig.build.json`, `eslint.config.mjs`, `.prettierrc`

## Don'ts

- Don't bypass existing lint/type rules without approval.
- Don't ignore test failures in CI.
- Don't use unapproved third-party packages without checking package manager manifests.
- Don't hardcode secrets or sensitive info in code, tests, docs, or config.
- Don't commit secrets/credentials to the repo.
- Don't edit generated files directly.
- Don't trigger releases without approval.

## Change Checklist

1. Run `npm run lint` to fix lint errors.
2. Run `npm run type-check` to verify types.
3. Run `npm run test` to ensure tests pass.
4. Run `npm run format` to format code.
