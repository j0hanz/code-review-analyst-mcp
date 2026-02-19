import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const RESOURCE_ID = 'server-instructions';
const RESOURCE_URI = 'internal://instructions';
const RESOURCE_MIME_TYPE = 'text/markdown';

function createInstructionsContents(
  uri: URL,
  instructions: string
): {
  uri: string;
  mimeType: string;
  text: string;
}[] {
  return [
    {
      uri: uri.href,
      mimeType: RESOURCE_MIME_TYPE,
      text: instructions,
    },
  ];
}

export function registerAllResources(
  server: McpServer,
  instructions: string
): void {
  server.registerResource(
    RESOURCE_ID,
    RESOURCE_URI,
    {
      title: 'Server Instructions',
      description: 'Guidance for using the MCP tools effectively.',
      mimeType: RESOURCE_MIME_TYPE,
      annotations: {
        audience: ['assistant'],
        priority: 0.8,
      },
    },
    (uri) => ({
      contents: createInstructionsContents(uri, instructions),
    })
  );
}
