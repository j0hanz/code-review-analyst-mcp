# Code Review Analyst MCP Server

<!-- mcp-name: io.github.j0hanz/code-review-analyst -->

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?style=flat-square&logo=nodedotjs&logoColor=white)](package.json) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9%2B-3178C6?style=flat-square&logo=typescript&logoColor=white)](package.json) [![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.26.0-6f42c1?style=flat-square)](package.json) [![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](package.json)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code%20Review%20Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22code-review-analyst-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code%20Review%20Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22code-review-analyst-mcp%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=Code%20Review%20Analyst&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNvZGUtcmV2aWV3LWFuYWx5c3QtbWNwQGxhdGVzdCJdfQ==)

Gemini-powered MCP server for pull request analysis with structured outputs for findings, release risk, and focused patch suggestions.

## Overview

This server runs over **stdio transport** and exposes three review-focused tools: `review_diff`, `risk_score`, and `suggest_patch`. It also publishes an `internal://instructions` resource and a `get-help` prompt for in-client guidance.

## Key Features

- Structured review analysis with strict JSON output envelopes (`ok`, `result`, `error`).
- Three complementary workflows: full review, release risk scoring, and targeted patch generation.
- Runtime diff-size budget guard (`MAX_DIFF_CHARS`, default `120000`).
- Optional task execution support (`execution.taskSupport: "optional"`) with in-memory task store.
- Progress notifications when clients provide `_meta.progressToken`.
- Shared Gemini adapter with timeout, retries, safety thresholds, and structured observability logs to `stderr`.

## Requirements

- Node.js `>=24`
- One API key: `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- MCP client that supports stdio servers and tool calls

## Quick Start

Standard config for most MCP clients:

```json
{
  "mcpServers": {
    "code-review-analyst": {
      "command": "npx",
      "args": ["-y", "code-review-analyst-mcp@latest"],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

> [!TIP]
> For local development, build and run directly via `node dist/index.js` after `npm run build`.

## Client Configuration

<details>
<summary><b>Install in VS Code</b></summary>

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code%20Review%20Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22code-review-analyst-mcp%40latest%22%5D%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code%20Review%20Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22code-review-analyst-mcp%40latest%22%5D%7D&quality=insiders)

`.vscode/mcp.json`

```json
{
  "servers": {
    "code-review-analyst": {
      "command": "npx",
      "args": ["-y", "code-review-analyst-mcp@latest"],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

CLI install:

```bash
code --add-mcp '{"name":"code-review-analyst","command":"npx","args":["-y","code-review-analyst-mcp@latest"]}'
```

</details>

<details>
<summary><b>Install in Cursor</b></summary>

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=Code%20Review%20Analyst&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNvZGUtcmV2aWV3LWFuYWx5c3QtbWNwQGxhdGVzdCJdfQ==)

`~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "code-review-analyst": {
      "command": "npx",
      "args": ["-y", "code-review-analyst-mcp@latest"],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

</details>

<details>
<summary><b>Install in Claude Desktop</b></summary>

`claude_desktop_config.json`

```json
{
  "mcpServers": {
    "code-review-analyst": {
      "command": "npx",
      "args": ["-y", "code-review-analyst-mcp@latest"],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

</details>

<details>
<summary><b>Install in Claude Code</b></summary>

```bash
claude mcp add code-review-analyst -- npx -y code-review-analyst-mcp@latest
```

</details>

## MCP Surface

### Tools

#### `review_diff`

Analyze a unified diff and return structured findings, overall merge risk, and test recommendations.

| Name          | Type       | Required | Default                                           | Description                                          |
| ------------- | ---------- | -------- | ------------------------------------------------- | ---------------------------------------------------- |
| `diff`        | `string`   | Yes      | —                                                 | Unified diff text (`10..400000` chars schema limit). |
| `repository`  | `string`   | Yes      | —                                                 | Repository identifier (example: `org/repo`).         |
| `language`    | `string`   | No       | `not specified`                                   | Primary language hint for analysis.                  |
| `focusAreas`  | `string[]` | No       | `security, correctness, regressions, performance` | Optional review priorities (`1..12` items).          |
| `maxFindings` | `integer`  | No       | `10`                                              | Max findings returned (`1..25`).                     |

Returns (inside `result`):

- `summary`, `overallRisk` (`low|medium|high`), `findings[]`, `testsNeeded[]`

Example:

```json
{
  "ok": true,
  "result": {
    "summary": "One high-risk auth-path change without null guards.",
    "overallRisk": "high",
    "findings": [
      {
        "severity": "high",
        "file": "src/auth.ts",
        "line": 42,
        "title": "Missing null check",
        "explanation": "Null response can throw and break login.",
        "recommendation": "Guard for null before property access."
      }
    ],
    "testsNeeded": ["Add auth null-path regression test"]
  }
}
```

#### `risk_score`

Score deployment risk for a diff and explain the score drivers.

| Name                    | Type                          | Required | Default  | Description                                          |
| ----------------------- | ----------------------------- | -------- | -------- | ---------------------------------------------------- |
| `diff`                  | `string`                      | Yes      | —        | Unified diff text (`10..400000` chars schema limit). |
| `deploymentCriticality` | `"low" \| "medium" \| "high"` | No       | `medium` | Sensitivity of target deployment.                    |

Returns (inside `result`):

- `score` (`0..100`), `bucket` (`low|medium|high|critical`), `rationale[]`

#### `suggest_patch`

Generate a focused unified-diff patch for one selected finding.

| Name             | Type                                     | Required | Default    | Description                                      |
| ---------------- | ---------------------------------------- | -------- | ---------- | ------------------------------------------------ |
| `diff`           | `string`                                 | Yes      | —          | Unified diff text containing the issue context.  |
| `findingTitle`   | `string`                                 | Yes      | —          | Short finding title (`3..160` chars).            |
| `findingDetails` | `string`                                 | Yes      | —          | Detailed finding explanation (`10..3000` chars). |
| `patchStyle`     | `"minimal" \| "balanced" \| "defensive"` | No       | `balanced` | Desired patch breadth.                           |

Returns (inside `result`):

- `summary`, `patch` (unified diff text), `validationChecklist[]`

### Resources

| URI                       | Name                  | MIME Type       | Description                                  |
| ------------------------- | --------------------- | --------------- | -------------------------------------------- |
| `internal://instructions` | `server-instructions` | `text/markdown` | In-repo usage guide for tools and workflows. |

### Prompts

| Name       | Description                        | Arguments |
| ---------- | ---------------------------------- | --------- |
| `get-help` | Returns server usage instructions. | None      |

### Tasks & Progress

- Server declares `capabilities.tasks` with tool-call task support.
- Each tool is registered with `execution.taskSupport: "optional"`.
- Progress updates are emitted via `notifications/progress` when `_meta.progressToken` is provided.
- Task storage uses in-memory task store (`InMemoryTaskStore`).

## Configuration

### Runtime Mode

| Mode                     | Supported | Notes                                  |
| ------------------------ | --------- | -------------------------------------- |
| `stdio`                  | Yes       | Active transport in `src/index.ts`.    |
| HTTP/SSE/Streamable HTTP | No        | Not implemented in current entrypoint. |

### Environment Variables

| Variable                      | Description                                                                                         | Default            | Required                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------- |
| `GEMINI_API_KEY`              | Gemini API key (preferred)                                                                          | —                  | One of `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| `GOOGLE_API_KEY`              | Alternate Gemini API key env                                                                        | —                  | One of `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| `GEMINI_MODEL`                | Gemini model id                                                                                     | `gemini-2.5-flash` | No                                          |
| `GEMINI_HARM_BLOCK_THRESHOLD` | Safety threshold (`BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE`) | `BLOCK_NONE`       | No                                          |
| `MAX_DIFF_CHARS`              | Runtime diff-size budget                                                                            | `120000`           | No                                          |
| `TASK_TIMEOUT_MS`             | Task-runner timeout for build/test scripts                                                          | unset              | No                                          |

## Security

- Stdio transport avoids HTTP exposure in the current runtime path.
- Runtime logs and warnings are written to `stderr`; avoid writing non-protocol output to `stdout` in stdio mode.
- Input and output contracts use strict Zod schemas (`z.strictObject`) with explicit bounds.
- Oversized diffs are rejected early with `E_INPUT_TOO_LARGE`.
- Tool metadata marks calls as `readOnlyHint: true` and `openWorldHint: true` (external model call, no local state mutation).

## Development

Install and run locally:

```bash
npm install
npm run build
npm start
```

Useful scripts:

| Script       | Command                                                                                         | Purpose                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `build`      | `node scripts/tasks.mjs build`                                                                  | Clean, compile, validate instructions, copy assets, set executable bit. |
| `dev`        | `tsc --watch --preserveWatchOutput`                                                             | TypeScript watch mode.                                                  |
| `dev:run`    | `node --env-file=.env --watch dist/index.js`                                                    | Run built server with watch and `.env`.                                 |
| `test`       | `node scripts/tasks.mjs test`                                                                   | Full build + Node test runner.                                          |
| `test:fast`  | `node --test --import tsx/esm ...`                                                              | Fast test path on TS sources.                                           |
| `type-check` | `node scripts/tasks.mjs type-check`                                                             | TypeScript no-emit checks.                                              |
| `lint`       | `eslint .`                                                                                      | ESLint checks.                                                          |
| `format`     | `prettier --write .`                                                                            | Prettier formatting.                                                    |
| `inspector`  | `npm run build && npx -y @modelcontextprotocol/inspector node dist/index.js ${workspaceFolder}` | MCP Inspector for stdio server.                                         |

Inspector examples:

```bash
# stdio
npx @modelcontextprotocol/inspector node dist/index.js
```

## Troubleshooting

- **`E_INPUT_TOO_LARGE`**: split diff into smaller chunks, then rerun.
- **`E_REVIEW_DIFF` / `E_RISK_SCORE` / `E_SUGGEST_PATCH`**: verify API key env vars and retry with narrower input.
- **`Gemini request timed out after ...ms.`**: reduce diff/prompt size or increase timeout in caller.
- **`Gemini returned an empty response body.`**: retry and check upstream model health.
- **Malformed model JSON response**: retry with same schema and inspect stderr logs.

## Contributing & License

- License: **MIT** (from `package.json`).
