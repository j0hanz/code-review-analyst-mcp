# Code Review Analyst MCP Server

<!-- mcp-name: io.github.j0hanz/code-review-analyst -->

[![npm](https://img.shields.io/npm/v/%40j0hanz%2Fcode-review-analyst-mcp?style=flat-square&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@j0hanz/code-review-analyst-mcp) [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?style=flat-square&logo=nodedotjs&logoColor=white)](package.json) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9%2B-3178C6?style=flat-square&logo=typescript&logoColor=white)](package.json) [![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.26%2B-6f42c1?style=flat-square)](package.json) [![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](package.json)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code+Review+Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code+Review+Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D&quality=insiders) [![Install in Visual Studio](https://img.shields.io/badge/Visual_Studio-Install_Server-C16FDE?logo=visualstudio&logoColor=white)](https://vs-open.link/mcp-install?%7B%22name%22%3A%22code-review-analyst%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=Code+Review+Analyst&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29kZS1yZXZpZXctYW5hbHlzdC1tY3BAbGF0ZXN0Il19) [![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y%20%40j0hanz%2Fcode-review-analyst-mcp%40latest&id=code-review-analyst&name=Code%20Review%20Analyst&description=Gemini-powered%20MCP%20server%20for%20code%20review%20analysis.)

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
- Docker image available via GitHub Container Registry.

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
      "args": ["-y", "@j0hanz/code-review-analyst-mcp@latest"],
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

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code+Review+Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code+Review+Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D&quality=insiders)

`.vscode/mcp.json`

```json
{
  "servers": {
    "code-review-analyst": {
      "command": "npx",
      "args": ["-y", "@j0hanz/code-review-analyst-mcp@latest"],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

CLI install:

```bash
code --add-mcp '{"name":"code-review-analyst","command":"npx","args":["-y","@j0hanz/code-review-analyst-mcp@latest"]}'
```

For more info, see [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

</details>

<details>
<summary><b>Install in Cursor</b></summary>

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=Code+Review+Analyst&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29kZS1yZXZpZXctYW5hbHlzdC1tY3BAbGF0ZXN0Il19)

`~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "code-review-analyst": {
      "command": "npx",
      "args": ["-y", "@j0hanz/code-review-analyst-mcp@latest"],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

For more info, see [Cursor MCP docs](https://cursor.com/docs/context/mcp).

</details>

<details>
<summary><b>Install in Claude Desktop</b></summary>

`claude_desktop_config.json`

```json
{
  "mcpServers": {
    "code-review-analyst": {
      "command": "npx",
      "args": ["-y", "@j0hanz/code-review-analyst-mcp@latest"],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

For more info, see [Claude Desktop MCP docs](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

</details>

<details>
<summary><b>Install in Claude Code</b></summary>

```bash
claude mcp add code-review-analyst -- npx -y @j0hanz/code-review-analyst-mcp@latest
```

For more info, see [Claude Code MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp).

</details>

<details>
<summary><b>Install in Windsurf</b></summary>

MCP config:

```json
{
  "mcpServers": {
    "code-review-analyst": {
      "command": "npx",
      "args": ["-y", "@j0hanz/code-review-analyst-mcp@latest"],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

For more info, see [Windsurf MCP docs](https://docs.windsurf.com/windsurf/cascade/mcp).

</details>

<details>
<summary><b>Install in Amp</b></summary>

```bash
amp mcp add code-review-analyst -- npx -y @j0hanz/code-review-analyst-mcp@latest
```

For more info, see [Amp MCP docs](https://ampcode.com/manual).

</details>

<details>
<summary><b>Install in Cline</b></summary>

`cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "code-review-analyst": {
      "command": "npx",
      "args": ["-y", "@j0hanz/code-review-analyst-mcp@latest"],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

For more info, see [Cline MCP docs](https://docs.cline.bot/mcp/adding-and-configuring-servers).

</details>

<details>
<summary><b>Install in Zed</b></summary>

`settings.json`

```json
{
  "context_servers": {
    "code-review-analyst": {
      "command": "npx",
      "args": ["-y", "@j0hanz/code-review-analyst-mcp@latest"]
    }
  }
}
```

For more info, see [Zed MCP docs](https://zed.dev/docs/ai/mcp).

</details>

<details>
<summary><b>Install with Docker</b></summary>

```json
{
  "mcpServers": {
    "code-review-analyst": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GEMINI_API_KEY",
        "ghcr.io/j0hanz/code-review-analyst-mcp:latest"
      ]
    }
  }
}
```

> [!NOTE]
> Set `GEMINI_API_KEY` in your shell environment before running. Docker passes it through via `-e GEMINI_API_KEY`.

</details>

## MCP Surface

### Tools

#### `review_diff`

Analyze a unified diff and return structured findings, overall merge risk, and test recommendations.

| Name          | Type       | Required | Default                                           | Description                                                             |
| ------------- | ---------- | -------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `diff`        | `string`   | Yes      | —                                                 | Unified diff text (`10..120,000` chars; override via `MAX_DIFF_CHARS`). |
| `repository`  | `string`   | Yes      | —                                                 | Repository identifier (example: `org/repo`).                            |
| `language`    | `string`   | No       | `not specified`                                   | Primary language hint for analysis.                                     |
| `focusAreas`  | `string[]` | No       | `security, correctness, regressions, performance` | Optional review priorities (`1..12` items).                             |
| `maxFindings` | `integer`  | No       | `10`                                              | Max findings returned (`1..25`).                                        |

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

| Name                    | Type                          | Required | Default  | Description                                                             |
| ----------------------- | ----------------------------- | -------- | -------- | ----------------------------------------------------------------------- |
| `diff`                  | `string`                      | Yes      | —        | Unified diff text (`10..120,000` chars; override via `MAX_DIFF_CHARS`). |
| `deploymentCriticality` | `"low" \| "medium" \| "high"` | No       | `medium` | Sensitivity of target deployment.                                       |

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

| Mode                     | Supported | Notes                               |
| ------------------------ | --------- | ----------------------------------- |
| `stdio`                  | Yes       | Active transport in `src/index.ts`. |
| HTTP/SSE/Streamable HTTP | No        | Not implemented.                    |

### CLI Arguments

The server binary accepts optional command-line flags:

| Option             | Short | Description                              | Env Override     |
| ------------------ | ----- | ---------------------------------------- | ---------------- |
| `--model`          | `-m`  | Override the Gemini model id at startup. | `GEMINI_MODEL`   |
| `--max-diff-chars` | —     | Override the runtime diff-size budget.   | `MAX_DIFF_CHARS` |

Example:

```bash
npx @j0hanz/code-review-analyst-mcp@latest --model gemini-2.5-pro --max-diff-chars 200000
```

### Environment Variables

| Variable                      | Description                                                                                         | Default            | Required                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------- |
| `GEMINI_API_KEY`              | Gemini API key (preferred).                                                                         | —                  | One of `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| `GOOGLE_API_KEY`              | Alternate Gemini API key env.                                                                       | —                  | One of `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| `GEMINI_MODEL`                | Gemini model id.                                                                                    | `gemini-2.5-flash` | No                                          |
| `GEMINI_HARM_BLOCK_THRESHOLD` | Safety threshold (`BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE`) | `BLOCK_NONE`       | No                                          |
| `MAX_DIFF_CHARS`              | Runtime diff-size budget (chars).                                                                   | `120000`           | No                                          |

## Security

- Stdio transport avoids HTTP exposure in the current runtime path.
- Runtime logs and warnings are written to `stderr`; no non-protocol output is written to `stdout`.
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

| Script       | Command                              | Purpose                                                                 |
| ------------ | ------------------------------------ | ----------------------------------------------------------------------- |
| `build`      | `node scripts/tasks.mjs build`       | Clean, compile, validate instructions, copy assets, set executable bit. |
| `dev`        | `tsc --watch --preserveWatchOutput`  | TypeScript watch mode.                                                  |
| `dev:run`    | `node --env-file=.env --watch dist/` | Run built server with watch and `.env`.                                 |
| `test`       | `node scripts/tasks.mjs test`        | Full build + Node test runner.                                          |
| `test:fast`  | `node --test --import tsx/esm ...`   | Fast test path on TS sources (no build step).                           |
| `type-check` | `node scripts/tasks.mjs type-check`  | TypeScript no-emit checks.                                              |
| `lint`       | `eslint .`                           | ESLint checks.                                                          |
| `lint:fix`   | `eslint . --fix`                     | ESLint auto-fix.                                                        |
| `format`     | `prettier --write .`                 | Prettier formatting.                                                    |
| `inspector`  | `npm run build && npx ... inspector` | MCP Inspector for the stdio server.                                     |

> [!TIP]
> Set `TASK_TIMEOUT_MS` (env var) to enforce a timeout on build/test script tasks in `scripts/tasks.mjs`.

Debugging with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### Docker

Build and run locally with Docker:

```bash
docker build -t code-review-analyst-mcp .
docker run -i --rm -e GEMINI_API_KEY code-review-analyst-mcp
```

Or use Docker Compose:

```bash
docker compose up --build
```

## Build & Release

Releases are managed via the `Release` GitHub Actions workflow (manual dispatch):

1. **Version bump** — increments `package.json` and `server.json`, commits and tags.
2. **npm publish** — publishes `@j0hanz/code-review-analyst-mcp` with OIDC provenance.
3. **MCP Registry** — publishes `io.github.j0hanz/code-review-analyst` to the [MCP Registry](https://registry.modelcontextprotocol.io).
4. **Docker image** — builds and pushes multi-arch (`linux/amd64`, `linux/arm64`) to `ghcr.io/j0hanz/code-review-analyst-mcp`.

## Troubleshooting

- **`E_INPUT_TOO_LARGE`**: Error result includes `{providedChars, maxChars}`. Split diff into smaller chunks or increase `MAX_DIFF_CHARS`.
- **`E_REVIEW_DIFF` / `E_RISK_SCORE` / `E_SUGGEST_PATCH`**: Verify API key env vars and retry with narrower input.
- **`Gemini request timed out after ...ms.`**: Reduce diff/prompt size or increase timeout in caller.
- **`Gemini returned an empty response body.`**: Retry and check upstream model health.
- **Malformed model JSON response**: Retry with same schema and inspect `stderr` logs.
- **Inspector not connecting**: Ensure the server is built (`npm run build`) before running the inspector.
- **Claude Desktop logs**: Check `~/Library/Logs/Claude/mcp*.log` (macOS) for server communication issues.

## Contributing & License

- Contributions are welcome. Please open an issue or pull request on [GitHub](https://github.com/j0hanz/code-review-analyst-mcp).
- License: **MIT** (see `package.json`).
