#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { parseArgs } from 'node:util';

import { getErrorMessage } from './lib/errors.js';
import { createServer } from './server.js';

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
const ARG_OPTION_MODEL = 'model';
const ARG_OPTION_MAX_DIFF_CHARS = 'max-diff-chars';
const CLI_OPTIONS = {
  [ARG_OPTION_MODEL]: {
    type: 'string',
    short: 'm',
  },
  [ARG_OPTION_MAX_DIFF_CHARS]: {
    type: 'string',
  },
} as const;
const ENV_BY_ARG = {
  [ARG_OPTION_MODEL]: 'GEMINI_MODEL',
  [ARG_OPTION_MAX_DIFF_CHARS]: 'MAX_DIFF_CHARS',
} as const;

type ServerInstance = ReturnType<typeof createServer>;

function setStringEnv(name: string, value: string | boolean | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
  }
}

function parseCommandLineArgs(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: CLI_OPTIONS,
    strict: false,
  });

  for (const [arg, envName] of Object.entries(ENV_BY_ARG)) {
    setStringEnv(envName, values[arg]);
  }
}

let shuttingDown = false;

async function shutdown(server: ServerInstance): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await server.close();
  process.exit(0);
}

function registerShutdownHandlers(server: ServerInstance): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => {
      void shutdown(server);
    });
  }
}

async function main(): Promise<void> {
  parseCommandLineArgs();
  const server = createServer();
  const transport = new StdioServerTransport();

  registerShutdownHandlers(server);
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(`[fatal] ${getErrorMessage(error)}`);
  process.exit(1);
});
