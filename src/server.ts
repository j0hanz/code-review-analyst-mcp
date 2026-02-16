import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAllPrompts } from './prompts/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllTools } from './tools/index.js';

function loadVersion(): string {
  const packageJsonPath = findPackageJSON(import.meta.url);
  if (!packageJsonPath) {
    throw new Error('Unable to locate package.json for code-review-analyst.');
  }

  const packageJson = readFileSync(packageJsonPath, 'utf8');
  const parsed: unknown = JSON.parse(packageJson);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    typeof parsed.version !== 'string'
  ) {
    throw new Error('Invalid package.json: missing or invalid version field');
  }
  return parsed.version;
}

export function createServer(): McpServer {
  const version = loadVersion();
  const server = new McpServer({
    name: 'code-review-analyst',
    version,
  });

  registerAllTools(server);
  registerAllResources(server);
  registerAllPrompts(server);

  return server;
}
