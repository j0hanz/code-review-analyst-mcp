import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAnalyzeComplexityTool } from './analyze-complexity.js';
import { registerAnalyzePrImpactTool } from './analyze-pr-impact.js';
import { registerDetectApiBreakingTool } from './detect-api-breaking.js';
import { registerGenerateDiffTool } from './generate-diff.js';
import { registerGenerateReviewSummaryTool } from './generate-review-summary.js';
import { registerGenerateTestPlanTool } from './generate-test-plan.js';
import { registerWebSearchTool } from './web-search.js';

type ToolRegistrar = (server: McpServer) => void;

const TOOL_REGISTRARS = [
  registerGenerateDiffTool,
  registerAnalyzePrImpactTool,
  registerGenerateReviewSummaryTool,
  registerGenerateTestPlanTool,
  registerAnalyzeComplexityTool,
  registerDetectApiBreakingTool,
  registerWebSearchTool,
] as const satisfies readonly ToolRegistrar[];

export function registerAllTools(server: McpServer): void {
  for (const registrar of TOOL_REGISTRARS) {
    registrar(server);
  }
}
