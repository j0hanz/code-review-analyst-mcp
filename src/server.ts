import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getErrorMessage } from './lib/errors.js';
import { registerAllPrompts } from './prompts/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllTools } from './tools/index.js';

interface PackageJsonMetadata {
  version: string;
}

function isPackageJsonMetadata(value: unknown): value is PackageJsonMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string' &&
    value.version.trim().length > 0
  );
}

function parsePackageJson(
  packageJson: string,
  packageJsonPath: string
): PackageJsonMetadata {
  let parsed: unknown;

  try {
    parsed = JSON.parse(packageJson);
  } catch (error: unknown) {
    throw new Error(
      `Invalid JSON in ${packageJsonPath}: ${getErrorMessage(error)}`
    );
  }

  if (!isPackageJsonMetadata(parsed)) {
    throw new Error(
      `Invalid package.json at ${packageJsonPath}: missing or invalid version field`
    );
  }

  return parsed;
}

function extractVersion(packageJson: string, packageJsonPath: string): string {
  return parsePackageJson(packageJson, packageJsonPath).version;
}

function readPackageJson(packageJsonPath: string): string {
  try {
    return readFileSync(packageJsonPath, 'utf8');
  } catch (error: unknown) {
    throw new Error(
      `Unable to read ${packageJsonPath}: ${getErrorMessage(error)}`
    );
  }
}

function loadVersion(): string {
  const packageJsonPath = findPackageJSON(import.meta.url);
  if (!packageJsonPath) {
    throw new Error('Unable to locate package.json for code-review-analyst.');
  }

  return extractVersion(readPackageJson(packageJsonPath), packageJsonPath);
}

const SERVER_VERSION = loadVersion();

function loadInstructions(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  try {
    return readFileSync(join(currentDir, 'instructions.md'), 'utf8');
  } catch (error: unknown) {
    process.emitWarning(
      `Failed to load instructions.md: ${getErrorMessage(error)}`
    );
    return '(Instructions failed to load)';
  }
}

const SERVER_INSTRUCTIONS = loadInstructions();
const SERVER_TASK_STORE = new InMemoryTaskStore();

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'code-review-analyst',
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      taskStore: SERVER_TASK_STORE,
      capabilities: {
        tasks: {
          list: {},
          cancel: {},
          requests: {
            tools: {
              call: {},
            },
          },
        },
      },
    }
  );

  registerAllTools(server);
  registerAllResources(server, SERVER_INSTRUCTIONS);
  registerAllPrompts(server, SERVER_INSTRUCTIONS);

  return server;
}
