import { getToolContracts } from '../lib/tool-contracts.js';
import { getSharedConstraints } from './tool-info.js';

const PROMPT_LIST = [
  '- `get-help`: Returns these server instructions.',
  '- `review-guide`: Workflow guide for a selected tool and focus area.',
];

const RESOURCE_LIST = [
  '- `internal://instructions`: This document.',
  '- `internal://tool-catalog`: Tool matrix and cross-tool data flow.',
  '- `internal://workflows`: Recommended multi-step tool workflows.',
  '- `internal://server-config`: Runtime limits and model configuration.',
  '- `internal://tool-info/{toolName}`: Per-tool contract details.',
];

function formatParameterLine(parameter: {
  name: string;
  type: string;
  required: boolean;
  constraints: string;
}): string {
  const required = parameter.required ? 'required' : 'optional';
  return `- \`${parameter.name}\` (${parameter.type}, ${required}; ${parameter.constraints})`;
}

function formatToolSection(
  contract: ReturnType<typeof getToolContracts>[number]
): string {
  const parameterLines = contract.params.map((parameter) =>
    formatParameterLine(parameter)
  );
  const thinkingLine =
    contract.thinkingBudget === undefined
      ? '- Thinking budget: disabled'
      : `- Thinking budget: ${contract.thinkingBudget}`;

  return `### \`${contract.name}\`
- Purpose: ${contract.purpose}
- Model: \`${contract.model}\`
- Timeout: ${Math.round(contract.timeoutMs / 1_000)}s
${thinkingLine}
- Max output tokens: ${contract.maxOutputTokens}
- Parameters:
${parameterLines.join('\n')}
- Output shape: \`${contract.outputShape}\``;
}

export function buildServerInstructions(): string {
  const contracts = getToolContracts();
  const toolNames = contracts
    .map((contract) => `\`${contract.name}\``)
    .join(', ');
  const toolSections = contracts.map((contract) => formatToolSection(contract));
  const constraintLines = getSharedConstraints().map(
    (constraint) => `- ${constraint}`
  );

  return `# CODE REVIEW ANALYST MCP INSTRUCTIONS

## CORE CAPABILITY
- Domain: Gemini-powered code review analysis over unified diffs.
- Tools: ${toolNames}
- Transport: stdio with task lifecycle support.

## PROMPTS
${PROMPT_LIST.join('\n')}

## RESOURCES
${RESOURCE_LIST.join('\n')}

## TOOL CONTRACTS
${toolSections.join('\n\n')}

## SHARED CONSTRAINTS
${constraintLines.join('\n')}
`;
}
