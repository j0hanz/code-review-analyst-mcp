import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAnalyzeComplexityTool } from './analyze-complexity.js';
import { registerAnalyzePrImpactTool } from './analyze-pr-impact.js';
import { registerDetectApiBreakingTool } from './detect-api-breaking.js';
import { registerGenerateDiffTool } from './generate-diff.js';
import { registerGenerateReviewSummaryTool } from './generate-review-summary.js';
import { registerGenerateTestPlanTool } from './generate-test-plan.js';
import { registerInspectCodeQualityTool } from './inspect-code-quality.js';
import { registerSuggestSearchReplaceTool } from './suggest-search-replace.js';

type ToolRegistrar = (server: McpServer) => void;

const TOOL_REGISTRARS = [
  registerGenerateDiffTool,
  registerAnalyzePrImpactTool,
  registerGenerateReviewSummaryTool,
  registerInspectCodeQualityTool,
  registerSuggestSearchReplaceTool,
  registerGenerateTestPlanTool,
  registerAnalyzeComplexityTool,
  registerDetectApiBreakingTool,
] as const satisfies readonly ToolRegistrar[];

export function registerAllTools(server: McpServer): void {
  TOOL_REGISTRARS.forEach((registrar) => {
    registrar(server);
  });
}
