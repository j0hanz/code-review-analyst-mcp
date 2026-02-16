# Code Review Analyst MCP Server

Gemini-powered MCP server for pull request analysis with three tools:

- `review_diff`
- `risk_score`
- `suggest_patch`

## Requirements

- Node.js `>=20`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`

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
      "args": ["C:/code-review-mcp/dist/src/index.js"],
      "env": {
        "GEMINI_API_KEY": "YOUR_KEY",
        "GEMINI_MODEL": "gemini-2.5-flash"
      }
    }
  }
}
```

## Notes

- This server uses strict JSON schema outputs for deterministic automation.
- Tool outputs include both `structuredContent` and JSON string `content`.
- Gemini usage metadata and latency are logged to `stderr` for observability.
