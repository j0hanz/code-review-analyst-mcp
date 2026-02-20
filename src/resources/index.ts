import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const RESOURCE_ID = 'server-instructions';
const RESOURCE_URI = 'internal://instructions';
const RESOURCE_MIME_TYPE = 'text/markdown';
const RESOURCE_METADATA = {
  title: 'Server Instructions',
  description: 'Guidance for using the MCP tools effectively.',
  mimeType: RESOURCE_MIME_TYPE,
  annotations: {
    audience: ['assistant' as const],
    priority: 0.8,
  },
};

export function registerAllResources(
  server: McpServer,
  instructions: string
): void {
  server.registerResource(
    RESOURCE_ID,
    RESOURCE_URI,
    RESOURCE_METADATA,
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: RESOURCE_MIME_TYPE,
          text: instructions,
        },
      ],
    })
  );
}
