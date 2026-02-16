import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAllResources(
  server: McpServer,
  instructions: string
): void {
  server.registerResource(
    'server-instructions',
    'internal://instructions',
    {
      title: 'Server Instructions',
      description: 'Guidance for using the MCP tools effectively.',
      mimeType: 'text/markdown',
      annotations: {
        audience: ['assistant'],
        priority: 0.8,
      },
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: instructions,
        },
      ],
    })
  );
}
