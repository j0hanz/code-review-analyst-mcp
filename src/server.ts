import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getErrorMessage } from './lib/errors.js';
import { registerAllPrompts } from './prompts/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllTools } from './tools/index.js';

interface PackageJsonMetadata {
  version: string;
}

const SERVER_NAME = 'code-review-analyst';
const INSTRUCTIONS_FILENAME = 'instructions.md';
const INSTRUCTIONS_FALLBACK = '(Instructions failed to load)';
const UTF8_ENCODING = 'utf8';
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

const SERVER_CAPABILITIES = {
  logging: {},
  completions: {},
  tasks: {
    list: {},
    cancel: {},
    requests: {
      tools: {
        call: {},
      },
    },
  },
} as const;

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

function readUtf8File(path: string): string {
  try {
    return readFileSync(path, UTF8_ENCODING);
  } catch (error: unknown) {
    throw new Error(`Unable to read ${path}: ${getErrorMessage(error)}`);
  }
}

function loadVersion(): string {
  const packageJsonPath = findPackageJSON(import.meta.url);
  if (!packageJsonPath) {
    throw new Error(`Unable to locate package.json for ${SERVER_NAME}.`);
  }

  const packageJsonText = readUtf8File(packageJsonPath);
  return parsePackageJson(packageJsonText, packageJsonPath).version;
}

const SERVER_VERSION = loadVersion();

function getInstructionsPath(): string {
  return join(CURRENT_DIR, INSTRUCTIONS_FILENAME);
}

function loadInstructions(): string {
  const instructionsPath = getInstructionsPath();

  try {
    return readUtf8File(instructionsPath);
  } catch (error: unknown) {
    process.emitWarning(
      `Failed to load ${INSTRUCTIONS_FILENAME}: ${getErrorMessage(error)}`
    );
    return INSTRUCTIONS_FALLBACK;
  }
}

const SERVER_INSTRUCTIONS = loadInstructions();
const SERVER_TASK_STORE = new InMemoryTaskStore();

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      taskStore: SERVER_TASK_STORE,
      capabilities: SERVER_CAPABILITIES,
    }
  );

  registerAllTools(server);
  registerAllResources(server, SERVER_INSTRUCTIONS);
  registerAllPrompts(server, SERVER_INSTRUCTIONS);

  return server;
}
