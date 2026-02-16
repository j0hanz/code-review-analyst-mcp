import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAllPrompts } from './prompts/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllTools } from './tools/index.js';

function extractVersion(packageJson: string, packageJsonPath: string): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(packageJson);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${packageJsonPath}: ${message}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    typeof parsed.version !== 'string' ||
    parsed.version.trim().length === 0
  ) {
    throw new Error(
      `Invalid package.json at ${packageJsonPath}: missing or invalid version field`
    );
  }

  return parsed.version;
}

function loadVersion(): string {
  const packageJsonPath = findPackageJSON(import.meta.url);
  if (!packageJsonPath) {
    throw new Error('Unable to locate package.json for code-review-analyst.');
  }

  let packageJson: string;
  try {
    packageJson = readFileSync(packageJsonPath, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${packageJsonPath}: ${message}`);
  }

  return extractVersion(packageJson, packageJsonPath);
}

const SERVER_VERSION = loadVersion();

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'code-review-analyst',
    version: SERVER_VERSION,
  });

  registerAllTools(server);
  registerAllResources(server);
  registerAllPrompts(server);

  return server;
}
