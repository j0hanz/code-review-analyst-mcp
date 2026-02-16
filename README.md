# Code Review Analyst MCP Server

Gemini-powered MCP server for pull request analysis with three tools:

- `review_diff`
- `risk_score`
- `suggest_patch`

## Requirements

- Node.js `>=24`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- Optional: `GEMINI_HARM_BLOCK_THRESHOLD` (`BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE`)

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Test

```bash
npm run test
```

## Run (stdio transport)

```bash
npm run build
npm start
```

## Streamable HTTP (Evaluation)

- Current default transport remains stdio.
- Streamable HTTP mode is intentionally not enabled by default.
- Security prerequisites before enablement:
  - Validate `Origin` headers and reject invalid origins.
  - Bind locally (localhost) unless explicitly hardened for remote deployment.
  - Implement auth/session controls (`MCP-Session-Id` handling, protocol version header checks).
  - Verify SSE/POST behavior against MCP transport requirements.

## Inspector

```bash
npm run inspector
```

## MCP Client Config (Example)

```json
{
  "mcpServers": {
    "code-review-analyst": {
      "command": "node",
      "args": ["C:/code-review-mcp/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "YOUR_KEY",
        "GEMINI_MODEL": "gemini-2.5-flash"
      }
    }
  }
}
```

## Workflow Guide

- See `.github/mcp/code-review-analyst-workflow.md` for the project-specific operator/agent flow.

## Notes

- This server uses strict JSON schema outputs for deterministic automation.
- Tool outputs include both `structuredContent` and JSON string `content`.
- Gemini usage metadata and latency are logged to `stderr` for observability.
- Safety thresholds default to `BLOCK_NONE` and can be overridden with `GEMINI_HARM_BLOCK_THRESHOLD`.
