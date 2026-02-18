import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const HELP_PROMPT_NAME = 'get-help';
const HELP_PROMPT_DESCRIPTION = 'Server usage instructions';

export function registerAllPrompts(
  server: McpServer,
  instructions: string
): void {
  server.registerPrompt(
    HELP_PROMPT_NAME,
    {
      title: 'Get Help',
      description: 'Return the server usage instructions.',
    },
    () => ({
      description: HELP_PROMPT_DESCRIPTION,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: instructions,
          },
        },
      ],
    })
  );
}
