import { getToolContracts } from '../lib/tool-contracts.js';
import { PROMPT_DEFINITIONS } from '../prompts/index.js';
import { DIFF_RESOURCE_DESCRIPTION, STATIC_RESOURCES } from './index.js';
import { getSharedConstraints } from './tool-info.js';

const PROMPT_LIST = PROMPT_DEFINITIONS.map(
  (def) => `- \`${def.name}\`: ${def.description}`
);

const RESOURCE_LIST = [
  ...STATIC_RESOURCES.map((def) => `- \`${def.uri}\`: ${def.description}`),
  '- `internal://tool-info/{toolName}`: Per-tool contract details.',
  `- \`diff://current\`: ${DIFF_RESOURCE_DESCRIPTION}`,
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

  if (contract.model === 'none') {
    // Synchronous built-in tool (no Gemini call)
    return `### \`${contract.name}\`
- Purpose: ${contract.purpose}
- Model: \`none\` (synchronous built-in)
- Parameters:
${parameterLines.join('\n')}
- Output shape: \`${contract.outputShape}\``;
  }

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
