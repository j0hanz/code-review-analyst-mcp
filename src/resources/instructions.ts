import { toBulletedList, toInlineCode } from '../lib/markdown.js';
import { getToolContracts } from '../lib/tool-contracts.js';
import { PROMPT_DEFINITIONS } from '../prompts/index.js';
import { DIFF_RESOURCE_DESCRIPTION, STATIC_RESOURCES } from './index.js';
import { getSharedConstraints } from './tool-info.js';

const PROMPT_LIST = PROMPT_DEFINITIONS.map(
  (def) => `${toInlineCode(def.name)}: ${def.description}`
);

const RESOURCE_LIST = [
  ...STATIC_RESOURCES.map(
    (def) => `${toInlineCode(def.uri)}: ${def.description}`
  ),
  `${toInlineCode('internal://tool-info/{toolName}')}: Per-tool contract details.`,
  `${toInlineCode('diff://current')}: ${DIFF_RESOURCE_DESCRIPTION}`,
];

function formatParameterLine(parameter: {
  name: string;
  type: string;
  required: boolean;
  constraints: string;
}): string {
  const req = parameter.required ? 'req' : 'opt';
  return `  - \`${parameter.name}\` (${parameter.type}, ${req}): ${parameter.constraints}`;
}

function formatToolSection(
  contract: ReturnType<typeof getToolContracts>[number]
): string {
  const parameterLines = contract.params.map((parameter) =>
    formatParameterLine(parameter)
  );

  if (contract.model === 'none') {
    return `### \`${contract.name}\` (Sync)
${contract.purpose}
- **Params**:
${parameterLines.join('\n')}
- **Output**: \`${contract.outputShape}\``;
  }

  const modelInfo = [
    'Flash',
    contract.thinkingLevel ? `Thinking:${contract.thinkingLevel}` : '',
    `${Math.round(contract.timeoutMs / 1_000)}s`,
    `MaxTokens:${contract.maxOutputTokens}`,
  ]
    .filter(Boolean)
    .join(', ');

  return `### \`${contract.name}\` (${modelInfo})
${contract.purpose}
- **Params**:
${parameterLines.join('\n')}
- **Output**: \`${contract.outputShape}\``;
}

export function buildServerInstructions(): string {
  const contracts = getToolContracts();
  const toolNames = contracts
    .map((contract) => `\`${contract.name}\``)
    .join(', ');
  const toolSections = contracts.map((contract) => formatToolSection(contract));
  const constraintLines = toBulletedList(getSharedConstraints());

  return `# CODE REVIEW ANALYST MCP

## CORE
- Domain: Gemini-powered diff review.
- Capabilities: tools, resources (subscribe), prompts, logging, completions, tasks.
- Tools: ${toolNames}

## PROMPTS
${toBulletedList(PROMPT_LIST)}

## RESOURCES
${toBulletedList(RESOURCE_LIST)}

## TOOLS
${toolSections.join('\n\n')}

## CONSTRAINTS
${constraintLines}

## TASK LIFECYCLE
- Progress steps (0–6): starting → validating input → building prompt → calling model → validating response → finalizing → done.
- Status messages update at each phase for task introspection.
- Schema repair: on validation failure, retries with error feedback (configurable via \`GEMINI_SCHEMA_RETRIES\`).
- Task terminal states: \`completed\` and \`failed\`; cancellations are surfaced as \`failed\` with \`error.kind=cancelled\`.
`;
}
