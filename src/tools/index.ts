import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerReviewDiffTool } from './review-diff.js';
import { registerRiskScoreTool } from './risk-score.js';
import { registerSuggestPatchTool } from './suggest-patch.js';

const TOOL_REGISTRARS = [
  registerReviewDiffTool,
  registerRiskScoreTool,
  registerSuggestPatchTool,
] as const;

export function registerAllTools(server: McpServer): void {
  for (const registerTool of TOOL_REGISTRARS) {
    registerTool(server);
  }
}
