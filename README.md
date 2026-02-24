# Code Review Analyst MCP Server

<!-- mcp-name: io.github.j0hanz/code-review-analyst -->

[![npm](https://img.shields.io/npm/v/%40j0hanz%2Fcode-review-analyst-mcp?style=flat-square&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@j0hanz/code-review-analyst-mcp) [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?style=flat-square&logo=nodedotjs&logoColor=white)](package.json) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9%2B-3178C6?style=flat-square&logo=typescript&logoColor=white)](package.json) [![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.26%2B-6f42c1?style=flat-square)](package.json) [![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](package.json)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code+Review+Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code+Review+Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D&quality=insiders) [![Install in Visual Studio](https://img.shields.io/badge/Visual_Studio-Install_Server-C16FDE?logo=visualstudio&logoColor=white)](https://vs-open.link/mcp-install?%7B%22name%22%3A%22code-review-analyst%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=code-review-analyst&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29kZS1yZXZpZXctYW5hbHlzdC1tY3BAbGF0ZXN0Il19)

Gemini-powered MCP server for pull request analysis with structured outputs for findings, release risk, and focused patch suggestions.

## Overview

This server accepts unified diffs and returns structured JSON results — findings with severity, impact categories, merge risk, test plans, and verbatim search/replace fixes. It uses Gemini Thinking models (Flash for fast tools, Flash for deep analysis) and runs over **stdio transport**.

## Key Features

- **Impact Analysis** — Objective severity scoring, breaking change detection, and rollback complexity assessment.
- **Review Summary** — Concise PR digest with merge recommendation and change statistics.
- **Deep Code Inspection** — Flash model with high thinking level for context-aware analysis using full file contents.
- **Search & Replace Fixes** — Verbatim, copy-paste-ready code fixes tied to specific findings.
- **Test Plan Generation** — Systematic test case generation with priority ranking and pseudocode.
- **Async Task Support** — All tools support MCP task lifecycle with progress notifications.

## Requirements

- Node.js `>=24`
- One API key: `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- MCP client that supports stdio servers and tool calls

## Quick Start

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

## Client Configuration

<details>
<summary><b>VS Code / VS Code Insiders</b></summary>

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code+Review+Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code+Review+Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D&quality=insiders)

Add to `.vscode/mcp.json`:

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

Or via CLI:

```bash
code --add-mcp '{"name":"code-review-analyst","command":"npx","args":["-y","@j0hanz/code-review-analyst-mcp@latest"]}'
```

</details>

<details>
<summary><b>Cursor</b></summary>

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=code-review-analyst&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovY29kZS1yZXZpZXctYW5hbHlzdC1tY3BAbGF0ZXN0Il19)

Add to `~/.cursor/mcp.json`:

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

</details>

<details>
<summary><b>Visual Studio</b></summary>

[![Install in Visual Studio](https://img.shields.io/badge/Visual_Studio-Install_Server-C16FDE?logo=visualstudio&logoColor=white)](https://vs-open.link/mcp-install?%7B%22name%22%3A%22code-review-analyst%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D)

For more info, see [Visual Studio MCP docs](https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers).

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Add to `claude_desktop_config.json`:

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

For more info, see [Claude Desktop MCP docs](https://modelcontextprotocol.io/quickstart/user).

</details>

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add code-review-analyst -- npx -y @j0hanz/code-review-analyst-mcp@latest
```

For more info, see [Claude Code MCP docs](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/tutorials#set-up-model-context-protocol-mcp).

</details>

<details>
<summary><b>Windsurf</b></summary>

Add to MCP config:

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

For more info, see [Windsurf MCP docs](https://docs.windsurf.com/windsurf/mcp).

</details>

<details>
<summary><b>Amp</b></summary>

```bash
amp mcp add code-review-analyst -- npx -y @j0hanz/code-review-analyst-mcp@latest
```

For more info, see [Amp MCP docs](https://docs.amp.dev/mcp).

</details>

<details>
<summary><b>Cline</b></summary>

Add to `cline_mcp_settings.json`:

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

For more info, see [Cline MCP docs](https://docs.cline.bot/mcp-servers/configuring-mcp-servers).

</details>

<details>
<summary><b>Zed</b></summary>

Add to Zed `settings.json`:

```json
{
  "context_servers": {
    "code-review-analyst": {
      "command": {
        "path": "npx",
        "args": ["-y", "@j0hanz/code-review-analyst-mcp@latest"],
        "env": {
          "GEMINI_API_KEY": "YOUR_API_KEY"
        }
      }
    }
  }
}
```

For more info, see [Zed MCP docs](https://zed.dev/docs/assistant/model-context-protocol).

</details>

<details>
<summary><b>Augment</b></summary>

Add to `settings.json`:

```json
{
  "augment.advanced": {
    "mcpServers": [
      {
        "name": "code-review-analyst",
        "command": "npx",
        "args": ["-y", "@j0hanz/code-review-analyst-mcp@latest"],
        "env": {
          "GEMINI_API_KEY": "YOUR_API_KEY"
        }
      }
    ]
  }
}
```

</details>

<details>
<summary><b>Docker</b></summary>

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
        "GEMINI_API_KEY=YOUR_API_KEY",
        "ghcr.io/j0hanz/code-review-analyst-mcp:latest"
      ]
    }
  }
}
```

Or build locally:

```bash
docker build -t code-review-analyst-mcp .
```

</details>

## Tools

> [!IMPORTANT]
> Call `generate_diff` first (`mode: "unstaged"` or `"staged"`). All review tools read the cached server-side diff (`diff://current`) and do not accept a direct `diff` parameter.

### `generate_diff`

Generate and cache the current branch diff for downstream review tools.

| Parameter | Type     | Required | Description                                        |
| --------- | -------- | -------- | -------------------------------------------------- |
| `mode`    | `string` | Yes      | `unstaged` (working tree) or `staged` (git index). |

**Returns:** `diffRef`, `stats` (files, added, deleted), `generatedAt`, `mode`, `message`.

### `analyze_pr_impact`

Assess the impact and risk of cached pull request changes using the Flash model.

| Parameter    | Type     | Required | Description                              |
| ------------ | -------- | -------- | ---------------------------------------- |
| `repository` | `string` | Yes      | Repository identifier (e.g. `org/repo`). |
| `language`   | `string` | No       | Primary language hint.                   |

**Returns:** `severity` (low/medium/high/critical), `categories[]`, `breakingChanges[]`, `affectedAreas[]`, `rollbackComplexity`, `summary`.

### `generate_review_summary`

Summarize a pull request diff and assess high-level risk using the Flash model.

| Parameter    | Type     | Required | Description                              |
| ------------ | -------- | -------- | ---------------------------------------- |
| `repository` | `string` | Yes      | Repository identifier (e.g. `org/repo`). |
| `language`   | `string` | No       | Primary language hint.                   |

**Returns:** `summary`, `overallRisk` (low/medium/high), `keyChanges[]`, `recommendation`, `stats` (filesChanged, linesAdded, linesRemoved).

### `inspect_code_quality`

Deep-dive code review using the Flash model with high thinking (16K token budget).

| Parameter     | Type       | Required | Description                                   |
| ------------- | ---------- | -------- | --------------------------------------------- |
| `repository`  | `string`   | Yes      | Repository identifier (e.g. `org/repo`).      |
| `language`    | `string`   | No       | Primary language hint.                        |
| `focusAreas`  | `string[]` | No       | Areas to inspect: security, correctness, etc. |
| `maxFindings` | `number`   | No       | Maximum findings to return (1-25).            |

**Returns:** `summary`, `overallRisk` (low/medium/high/critical), `findings[]` (severity, file, line, title, explanation, recommendation), `testsNeeded[]`, `contextualInsights[]`.

> [!NOTE]
> Diff size bounded by `MAX_DIFF_CHARS` (default 120,000). Expect 60-120s latency due to deep thinking.

### `suggest_search_replace`

Generate verbatim search-and-replace blocks to fix a specific finding using the Flash model with high thinking.

| Parameter        | Type     | Required | Description                              |
| ---------------- | -------- | -------- | ---------------------------------------- |
| `findingTitle`   | `string` | Yes      | Short title of the finding to fix.       |
| `findingDetails` | `string` | Yes      | Detailed explanation of the bug or risk. |

**Returns:** `summary`, `blocks[]` (file, search, replace, explanation), `validationChecklist[]`.

### `generate_test_plan`

Create a test plan covering the changes in the diff using the Flash model with thinking (8K token budget).

| Parameter       | Type     | Required | Description                                 |
| --------------- | -------- | -------- | ------------------------------------------- |
| `repository`    | `string` | Yes      | Repository identifier (e.g. `org/repo`).    |
| `language`      | `string` | No       | Primary language hint.                      |
| `testFramework` | `string` | No       | Test framework (e.g. jest, vitest, pytest). |
| `maxTestCases`  | `number` | No       | Maximum test cases to return (1-30).        |

**Returns:** `summary`, `testCases[]` (name, type, file, description, pseudoCode, priority), `coverageSummary`.

## Resources

| URI                       | Type            | Description                |
| ------------------------- | --------------- | -------------------------- |
| `internal://instructions` | `text/markdown` | Server usage instructions. |

## Prompts

| Name           | Arguments           | Description                                         |
| -------------- | ------------------- | --------------------------------------------------- |
| `get-help`     | —                   | Return the server usage instructions.               |
| `review-guide` | `tool`, `focusArea` | Guided workflow for a specific tool and focus area. |

## Configuration

### CLI Arguments

| Option             | Description            | Env Var Equivalent |
| ------------------ | ---------------------- | ------------------ |
| `--model`, `-m`    | Override default model | `GEMINI_MODEL`     |
| `--max-diff-chars` | Override max diff size | `MAX_DIFF_CHARS`   |

### Environment Variables

| Variable                        | Description                                          | Default      | Required |
| ------------------------------- | ---------------------------------------------------- | ------------ | -------- |
| `GEMINI_API_KEY`                | Gemini API key                                       | —            | Yes      |
| `GOOGLE_API_KEY`                | Alternative API key (if `GEMINI_API_KEY` not set)    | —            | No       |
| `GEMINI_MODEL`                  | Override default model selection                     | —            | No       |
| `GEMINI_HARM_BLOCK_THRESHOLD`   | Safety threshold (BLOCK_NONE, BLOCK_ONLY_HIGH, etc.) | `BLOCK_NONE` | No       |
| `MAX_DIFF_CHARS`                | Max chars for diff input                             | `120000`     | No       |
| `MAX_CONCURRENT_CALLS`          | Max concurrent Gemini requests                       | `10`         | No       |
| `MAX_CONCURRENT_BATCH_CALLS`    | Max concurrent inline batch requests                 | `2`          | No       |
| `MAX_CONCURRENT_CALLS_WAIT_MS`  | Max wait time for a free Gemini slot                 | `2000`       | No       |
| `MAX_SCHEMA_RETRY_ERROR_CHARS`  | Max chars from schema error injected into retry text | `1500`       | No       |
| `GEMINI_BATCH_MODE`             | Request mode for Gemini calls (`off`, `inline`)      | `off`        | No       |
| `GEMINI_BATCH_POLL_INTERVAL_MS` | Poll interval for batch job status                   | `2000`       | No       |
| `GEMINI_BATCH_TIMEOUT_MS`       | Max wait for batch completion                        | `120000`     | No       |

### Models

| Tool                      | Model                    | Thinking Level |
| ------------------------- | ------------------------ | -------------- |
| `analyze_pr_impact`       | `gemini-3-flash-preview` | `minimal`      |
| `generate_review_summary` | `gemini-3-flash-preview` | `minimal`      |
| `inspect_code_quality`    | `gemini-3-flash-preview` | `high`         |
| `suggest_search_replace`  | `gemini-3-flash-preview` | `high`         |
| `generate_test_plan`      | `gemini-3-flash-preview` | `medium`       |

## Workflows

### Quick PR Triage

1. Call `analyze_pr_impact` to get severity and category breakdown.
2. If low/medium — call `generate_review_summary` for a quick digest.
3. If high/critical — proceed to deep inspection.

### Deep Code Inspection

1. Call `inspect_code_quality` with the cached diff.
2. Use `focusAreas` to target specific concerns (security, performance).
3. Review `findings` and `contextualInsights`.

### Remediation & Testing

1. For each finding, call `suggest_search_replace` with `findingTitle` and `findingDetails`.
2. Call `generate_test_plan` to create a verification strategy.
3. Apply fixes and implement tests.

## Development

```bash
npm ci            # Install dependencies
npm run dev       # TypeScript watch mode
npm run dev:run   # Run built server with .env and --watch
```

| Script               | Command                             | Purpose                        |
| -------------------- | ----------------------------------- | ------------------------------ |
| `npm run build`      | `node scripts/tasks.mjs build`      | Clean, compile, validate, copy |
| `npm test`           | `node scripts/tasks.mjs test`       | Build + run all tests          |
| `npm run test:fast`  | `node --test --import tsx/esm ...`  | Run tests without build        |
| `npm run lint`       | `eslint .`                          | Lint all files                 |
| `npm run lint:fix`   | `eslint . --fix`                    | Lint and auto-fix              |
| `npm run format`     | `prettier --write .`                | Format all files               |
| `npm run type-check` | `node scripts/tasks.mjs type-check` | Type-check without emitting    |
| `npm run inspector`  | Build + launch MCP Inspector        | Debug with MCP Inspector       |

### Debugging with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Build & Release

Releases are triggered via GitHub Actions `workflow_dispatch` with version bump selection (patch/minor/major/custom).

The pipeline runs lint, type-check, test, and build, then publishes to three targets in parallel:

- **npm** — `@j0hanz/code-review-analyst-mcp` with OIDC trusted publishing and provenance
- **Docker** — `ghcr.io/j0hanz/code-review-analyst-mcp` (linux/amd64, linux/arm64)
- **MCP Registry** — `io.github.j0hanz/code-review-analyst`

## Troubleshooting

| Issue                                      | Solution                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `Missing GEMINI_API_KEY or GOOGLE_API_KEY` | Set one of the API key env vars in your MCP client config.                           |
| `E_INPUT_TOO_LARGE`                        | Diff exceeds budget. Split into smaller diffs.                                       |
| `Gemini request timed out`                 | Deep analysis tasks may take 60-120s. Increase your client timeout.                  |
| `Too many concurrent Gemini calls`         | Reduce parallel tool calls or increase `MAX_CONCURRENT_CALLS`.                       |
| No tool output visible                     | Ensure your MCP client is not swallowing `stderr` — the server uses stdio transport. |

## License

MIT
