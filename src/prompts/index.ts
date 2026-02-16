import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAllPrompts(
  server: McpServer,
  instructions: string
): void {
  server.registerPrompt(
    'get-help',
    {
      title: 'Get Help',
      description: 'Return the server usage instructions.',
    },
    () => ({
      description: 'Server usage instructions',
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
