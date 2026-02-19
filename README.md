# Code Review Analyst MCP Server

<!-- mcp-name: io.github.j0hanz/code-review-analyst -->

[![npm](https://img.shields.io/npm/v/%40j0hanz%2Fcode-review-analyst-mcp?style=flat-square&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@j0hanz/code-review-analyst-mcp) [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?style=flat-square&logo=nodedotjs&logoColor=white)](package.json) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9%2B-3178C6?style=flat-square&logo=typescript&logoColor=white)](package.json) [![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.26%2B-6f42c1?style=flat-square)](package.json) [![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](package.json)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code+Review+Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=Code+Review+Analyst&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D&quality=insiders) [![Install in Visual Studio](https://img.shields.io/badge/Visual_Studio-Install_Server-C16FDE?logo=visualstudio&logoColor=white)](https://vs-open.link/mcp-install?%7B%22name%22%3A%22code-review-analyst%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fcode-review-analyst-mcp%40latest%22%5D%7D)

Gemini-powered MCP server for pull request analysis with structured outputs for findings, release risk, and focused patch suggestions.

## Overview

This server runs over **stdio transport** and exposes five review-focused tools. It leverages Gemini Thinking models for deep analysis.

## Key Features

- **Analyze PR Impact**: Objective severity scoring and categorization.
- **Review Summary**: Concise digest and merge recommendation.
- **Code Quality Inspection**: Deep-dive analysis using Pro models with thinking.
- **Search & Replace**: Reliable, verbatim code fixes.
- **Test Planning**: Systematic test case generation.
- **Progress Notifications**: Async task support with progress tracking.

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

## Tools

| Tool                      | Purpose                         | Model            |
| ------------------------- | ------------------------------- | ---------------- |
| `analyze_pr_impact`       | Assess severity and categories  | Flash            |
| `generate_review_summary` | Summary and risk assessment     | Flash            |
| `inspect_code_quality`    | Deep analysis with file context | Pro (Thinking)   |
| `suggest_search_replace`  | Generate exact fixes            | Pro (Thinking)   |
| `generate_test_plan`      | Create test strategy            | Flash (Thinking) |

See [src/instructions.md](src/instructions.md) for detailed inputs and outputs.

## Configuration

| Variable            | Description                         | Default |
| ------------------- | ----------------------------------- | ------- |
| `GEMINI_API_KEY`    | API Key                             | -       |
| `GEMINI_MODEL`      | Override default model selection    | -       |
| `MAX_DIFF_CHARS`    | Max chars for diff input            | 120,000 |
| `MAX_CONTEXT_CHARS` | Max combined context for inspection | 500,000 |

## License

MIT
