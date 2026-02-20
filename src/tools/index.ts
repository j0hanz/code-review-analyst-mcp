import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAnalyzePrImpactTool } from './analyze-pr-impact.js';
import { registerGenerateReviewSummaryTool } from './generate-review-summary.js';
import { registerGenerateTestPlanTool } from './generate-test-plan.js';
import { registerInspectCodeQualityTool } from './inspect-code-quality.js';
import { registerSuggestSearchReplaceTool } from './suggest-search-replace.js';

type ToolRegistrar = (server: McpServer) => void;

const TOOL_REGISTRARS = [
  registerAnalyzePrImpactTool,
  registerGenerateReviewSummaryTool,
  registerInspectCodeQualityTool,
  registerSuggestSearchReplaceTool,
  registerGenerateTestPlanTool,
] as const satisfies readonly ToolRegistrar[];

export function registerAllTools(server: McpServer): void {
  for (const registerTool of TOOL_REGISTRARS) {
    registerTool(server);
  }
}
