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
const PACKAGE_VERSION_FIELD = 'version';
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const INSTRUCTIONS_PATH = join(CURRENT_DIR, INSTRUCTIONS_FILENAME);
const VERSION_FIELD_ERROR = 'missing or invalid version field';

const SERVER_CAPABILITIES = {
  logging: {},
  completions: {},
  resources: {},
  tools: {},
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
    PACKAGE_VERSION_FIELD in value &&
    typeof value.version === 'string' &&
    value.version.trim().length > 0
  );
}

function parsePackageJson(
  packageJson: string,
  packageJsonPath: string
): PackageJsonMetadata {
  const parsed = parseJsonText(packageJson, packageJsonPath);
  ensurePackageJsonMetadata(parsed, packageJsonPath);
  return parsed;
}

function parseJsonText(jsonText: string, sourcePath: string): unknown {
  try {
    return JSON.parse(jsonText);
  } catch (error: unknown) {
    throw new Error(`Invalid JSON in ${sourcePath}: ${getErrorMessage(error)}`);
  }
}

function ensurePackageJsonMetadata(
  metadata: unknown,
  packageJsonPath: string
): asserts metadata is PackageJsonMetadata {
  if (!isPackageJsonMetadata(metadata)) {
    throw new Error(
      `Invalid package.json at ${packageJsonPath}: ${VERSION_FIELD_ERROR}`
    );
  }
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

function loadInstructions(): string {
  try {
    return readUtf8File(INSTRUCTIONS_PATH);
  } catch (error: unknown) {
    process.emitWarning(
      `Failed to load ${INSTRUCTIONS_FILENAME}: ${getErrorMessage(error)}`
    );
    return INSTRUCTIONS_FALLBACK;
  }
}

const SERVER_INSTRUCTIONS = loadInstructions();

export interface ServerHandle {
  server: McpServer;
  shutdown: () => Promise<void>;
}

function createMcpServer(taskStore: InMemoryTaskStore): McpServer {
  return new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      taskStore,
      capabilities: SERVER_CAPABILITIES,
    }
  );
}

function registerServerCapabilities(server: McpServer): void {
  registerAllTools(server);
  registerAllResources(server, SERVER_INSTRUCTIONS);
  registerAllPrompts(server, SERVER_INSTRUCTIONS);
}

export function createServer(): ServerHandle {
  const taskStore = new InMemoryTaskStore();
  const server = createMcpServer(taskStore);
  registerServerCapabilities(server);

  const shutdown = async (): Promise<void> => {
    await server.close();
    taskStore.cleanup();
  };

  return { server, shutdown };
}
