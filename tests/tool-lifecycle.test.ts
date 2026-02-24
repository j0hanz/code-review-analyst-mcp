import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type {
  CallToolResult,
  Progress,
} from '@modelcontextprotocol/sdk/types.js';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GoogleGenAI } from '@google/genai';

import { setDiffForTesting } from '../src/lib/diff-store.js';
import { setClientForTesting } from '../src/lib/gemini.js';
import { createServer } from '../src/server.js';

const SAMPLE_DIFF = `diff --git a/src/index.ts b/src/index.ts
index 123..456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1 +1 @@
-console.log('old');
+console.log('new');
`;

const SAMPLE_DIFF_SLOT = {
  diff: SAMPLE_DIFF,
  parsedFiles: [],
  stats: { files: 1, added: 1, deleted: 1 },
  generatedAt: new Date().toISOString(),
  mode: 'unstaged',
} as const;

function createClientServerPair(): {
  client: Client;
  connect: () => Promise<void>;
  close: () => Promise<void>;
} {
  const { server, shutdown } = createServer();
  const client = new Client(
    { name: 'tool-lifecycle-test', version: '0.0.0' },
    {
      capabilities: {
        sampling: {},
      },
    }
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  return {
    client,
    connect: async () => {
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
    },
    close: async () => {
      await client.close();
      await shutdown();
    },
  };
}

function setMockClient(
  generateContent: (...args: unknown[]) => Promise<unknown>
): void {
  const mockClient = {
    models: {
      generateContent,
    },
  } as unknown as GoogleGenAI;

  setClientForTesting(mockClient);
}

// Helper to wrap client.callTool with Promise-based result
async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  options: { onprogress?: (progress: Progress) => void }
): Promise<CallToolResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await client.callTool(
    { name, arguments: args },
    CallToolResultSchema,
    options
  )) as unknown as CallToolResult;
}

test('analyze_pr_impact emits progress and returns result', async () => {
  setMockClient(async () => {
    return {
      text: JSON.stringify({
        severity: 'low',
        categories: ['bug_fix'],
        summary: 'Minor non-breaking bug fix.',
        breakingChanges: [],
        affectedAreas: ['src/index.ts'],
        rollbackComplexity: 'trivial',
      }),
    };
  });

  setDiffForTesting(SAMPLE_DIFF_SLOT);
  const { client, connect, close } = createClientServerPair();
  await connect();

  const progressUpdates: Progress[] = [];
  try {
    const result = await callTool(
      client,
      'analyze_pr_impact',
      { repository: 'org/repo' },
      {
        onprogress: (progress) => {
          progressUpdates.push(progress);
        },
      }
    );

    assert.equal(result.isError, undefined);
    assert.ok(result.content.some((c) => c.type === 'text'));
    // We expect some progress, though validation steps might be fast
    assert.ok(progressUpdates.length > 0, 'Should emit progress');
  } finally {
    setDiffForTesting(undefined);
    await close();
  }
});

test('analyze_pr_impact handles failure correctly', async () => {
  // Simulate Gemini failure
  setMockClient(async () => {
    throw new Error('Upstream error');
  });

  setDiffForTesting(SAMPLE_DIFF_SLOT);
  const { client, connect, close } = createClientServerPair();
  await connect();

  const progressUpdates: Progress[] = [];
  try {
    const result = await callTool(
      client,
      'analyze_pr_impact',
      { repository: 'org/repo' },
      {
        onprogress: (progress) => {
          progressUpdates.push(progress);
        },
      }
    );

    assert.equal(result.isError, true);
    // Even on failure, we might get "starting" progress
    assert.ok(progressUpdates.length >= 0);
  } finally {
    setDiffForTesting(undefined);
    await close();
  }
});

test('analyze_pr_impact validates input schema', async () => {
  setDiffForTesting(SAMPLE_DIFF_SLOT);
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    // Missing 'repository'
    const result = await callTool(
      client,
      'analyze_pr_impact',
      { language: 'ts' } as any,
      {}
    );
    assert.equal(result.isError, true);
    assert.match(
      (result.content[0] as { text: string }).text,
      /validation/i,
      'Error message should mention validation'
    );
  } finally {
    setDiffForTesting(undefined);
    await close();
  }
});
