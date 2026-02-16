#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { parseArgs } from 'node:util';

import { getErrorMessage } from './lib/errors.js';
import { createServer } from './server.js';

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

function parseCommandLineArgs(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      model: {
        type: 'string',
        short: 'm',
      },
      'max-diff-chars': {
        type: 'string',
      },
    },
    strict: false,
  });

  if (typeof values.model === 'string') {
    process.env.GEMINI_MODEL = values.model;
  }

  if (typeof values['max-diff-chars'] === 'string') {
    process.env.MAX_DIFF_CHARS = values['max-diff-chars'];
  }
}

let shuttingDown = false;

async function shutdown(
  server: ReturnType<typeof createServer>
): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await server.close();
  process.exit(0);
}

function registerShutdownHandlers(
  server: ReturnType<typeof createServer>
): void {
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
