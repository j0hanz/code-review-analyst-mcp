import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const RESOURCE_ID = 'server-instructions';
const RESOURCE_URI = 'internal://instructions';
const RESOURCE_MIME_TYPE = 'text/markdown';
const RESOURCE_AUDIENCE = ['assistant' as const];
const RESOURCE_METADATA = {
  title: 'Server Instructions',
  description: 'Guidance for using the MCP tools effectively.',
  mimeType: RESOURCE_MIME_TYPE,
  annotations: {
    audience: RESOURCE_AUDIENCE,
    priority: 0.8,
  },
};

function createInstructionsContent(
  uri: URL,
  instructions: string
): {
  uri: string;
  mimeType: string;
  text: string;
} {
  return {
    uri: uri.href,
    mimeType: RESOURCE_MIME_TYPE,
    text: instructions,
  };
}

export function registerAllResources(
  server: McpServer,
  instructions: string
): void {
  server.registerResource(
    RESOURCE_ID,
    RESOURCE_URI,
    RESOURCE_METADATA,
    (uri) => ({
      contents: [createInstructionsContent(uri, instructions)],
    })
  );
}
