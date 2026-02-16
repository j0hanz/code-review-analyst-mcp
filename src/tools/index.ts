import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerReviewDiffTool } from './review-diff.js';
import { registerRiskScoreTool } from './risk-score.js';
import { registerSuggestPatchTool } from './suggest-patch.js';

export function registerAllTools(server: McpServer): void {
  registerReviewDiffTool(server);
  registerRiskScoreTool(server);
  registerSuggestPatchTool(server);
}
