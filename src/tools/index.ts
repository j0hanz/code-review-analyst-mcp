import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerReviewDiffTool } from './review-diff.js';
import { registerRiskScoreTool } from './risk-score.js';
import { registerSuggestPatchTool } from './suggest-patch.js';

type ToolRegistrar = (server: McpServer) => void;

const TOOL_REGISTRARS = [
  registerReviewDiffTool,
  registerRiskScoreTool,
  registerSuggestPatchTool,
] as const satisfies readonly ToolRegistrar[];

export function registerAllTools(server: McpServer): void {
  for (const registerTool of TOOL_REGISTRARS) {
    registerTool(server);
  }
}
