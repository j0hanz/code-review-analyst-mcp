import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAnalyzeComplexityTool } from './analyze-complexity.js';
import { registerAnalyzePrImpactTool } from './analyze-pr-impact.js';
import { registerDetectApiBreakingTool } from './detect-api-breaking.js';
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
  registerAnalyzeComplexityTool,
  registerDetectApiBreakingTool,
] as const satisfies readonly ToolRegistrar[];

function applyToolRegistrar(server: McpServer, registrar: ToolRegistrar): void {
  registrar(server);
}

export function registerAllTools(server: McpServer): void {
  for (const registrar of TOOL_REGISTRARS) {
    applyToolRegistrar(server, registrar);
  }
}
