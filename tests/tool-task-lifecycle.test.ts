import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type {
  CallToolResult,
  Progress,
} from '@modelcontextprotocol/sdk/types.js';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GoogleGenAI } from '@google/genai';

import { resetMaxContextCharsCacheForTesting } from '../src/lib/context-budget.js';
import { resetMaxDiffCharsCacheForTesting } from '../src/lib/diff-budget.js';
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

function createClientServerPair(): {
  client: Client;
  connect: () => Promise<void>;
  close: () => Promise<void>;
} {
  const { server, shutdown } = createServer();
  const client = new Client({ name: 'task-lifecycle-test', version: '0.0.0' });
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

async function callToolAsTask(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  options?: { onprogress?: (progress: Progress) => void }
): Promise<CallToolResult> {
  const stream = client.experimental.tasks.callToolStream(
    { name, arguments: args },
    CallToolResultSchema,
    {
      task: {},
      ...(options?.onprogress ? { onprogress: options.onprogress } : undefined),
    }
  );
  for await (const message of stream) {
    if (message.type === 'result') {
      return message.result;
    }
    if (message.type === 'error') {
      throw message.error;
    }
  }
  throw new Error('Task stream closed without result or error');
}

function assertProgressLifecycle(
  updates: readonly Progress[],
  expectedOutcome: 'completed' | 'failed'
): void {
  assert.ok(
    updates.length >= 2,
    'Expected at least start and terminal updates'
  );

  const first = updates[0];
  assert.equal(first?.progress, 0);
  assert.equal(first?.total, 4);
  assert.match(first?.message ?? '', /\[starting\]/);

  let previous = -1;
  for (const update of updates) {
    assert.ok(update.progress >= previous, 'Progress must be monotonic');
    previous = update.progress;
  }

  const terminalIndex = updates.findIndex((update) => {
    return update.total !== undefined && update.total === update.progress;
  });

  assert.notEqual(terminalIndex, -1, 'Expected a terminal progress update');
  assert.equal(
    terminalIndex,
    updates.length - 1,
    'Terminal progress must be the final update'
  );

  const terminal = updates[updates.length - 1];
  assert.equal(terminal?.total, terminal?.progress);
  assert.match(terminal?.message ?? '', new RegExp(`• ${expectedOutcome}$`));
}

test('analyze_pr_impact succeeds without task persistence errors', async () => {
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

  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const progressUpdates: Progress[] = [];
    const result = await callToolAsTask(
      client,
      'analyze_pr_impact',
      {
        diff: SAMPLE_DIFF,
        repository: 'org/repo',
      },
      {
        onprogress: (progress) => {
          progressUpdates.push(progress);
        },
      }
    );

    assert.notEqual(result.isError, true);
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.ok, true);
    assertProgressLifecycle(progressUpdates, 'severity: low');
  } finally {
    await close();
  }
});

test('analyze_pr_impact returns budget error without crashing task flow', async () => {
  process.env.MAX_DIFF_CHARS = '20';
  resetMaxDiffCharsCacheForTesting();

  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const progressUpdates: Progress[] = [];
    const result = await callToolAsTask(
      client,
      'analyze_pr_impact',
      {
        diff: SAMPLE_DIFF,
        repository: 'org/repo',
      },
      {
        onprogress: (progress) => {
          progressUpdates.push(progress);
        },
      }
    );

    assert.equal(result.isError, true);
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.ok, false);
    assert.equal(
      (result.structuredContent.error as { code: string }).code,
      'E_INPUT_TOO_LARGE'
    );
    assertProgressLifecycle(progressUpdates, 'rejected');
  } finally {
    await close();
    delete process.env.MAX_DIFF_CHARS;
    resetMaxDiffCharsCacheForTesting();
  }
});

test('tool boundary rejects unknown input fields', async () => {
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    await assert.rejects(
      callToolAsTask(client, 'analyze_pr_impact', {
        diff: SAMPLE_DIFF,
        repository: 'org/repo',
        unknown_field: 'unexpected',
      })
    );
  } finally {
    await close();
  }
});

test('inspect_code_quality respects maxFindings cap', async () => {
  setMockClient(async () => {
    return {
      text: JSON.stringify({
        summary: 'Found multiple issues.',
        overallRisk: 'high',
        findings: [
          {
            severity: 'high',
            file: 'src/a.ts',
            line: 10,
            title: 'Issue A',
            explanation: 'A'.repeat(20),
            recommendation: 'A'.repeat(20),
          },
          {
            severity: 'medium',
            file: 'src/b.ts',
            line: 20,
            title: 'Issue B',
            explanation: 'B'.repeat(20),
            recommendation: 'B'.repeat(20),
          },
        ],
        testsNeeded: [],
        contextualInsights: [],
      }),
    };
  });

  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const result = await callToolAsTask(client, 'inspect_code_quality', {
      diff: SAMPLE_DIFF,
      repository: 'org/repo',
      maxFindings: 1,
    });

    assert.notEqual(result.isError, true);
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.ok, true);
    const structuredResult = result.structuredContent.result as {
      findings: unknown[];
    };
    assert.equal(structuredResult.findings.length, 1);
  } finally {
    await close();
  }
});

test('generate_test_plan respects maxTestCases cap', async () => {
  setMockClient(async () => {
    return {
      text: JSON.stringify({
        summary: 'Comprehensive test plan.',
        testCases: [
          {
            name: 'case 1',
            type: 'unit',
            file: 'tests/a.test.ts',
            description: 'desc 1',
            pseudoCode: 'code 1',
            priority: 'must_have',
          },
          {
            name: 'case 2',
            type: 'integration',
            file: 'tests/b.test.ts',
            description: 'desc 2',
            pseudoCode: 'code 2',
            priority: 'should_have',
          },
          {
            name: 'case 3',
            type: 'regression',
            file: 'tests/c.test.ts',
            description: 'desc 3',
            pseudoCode: 'code 3',
            priority: 'nice_to_have',
          },
        ],
        coverageSummary: 'Covers risk areas.',
      }),
    };
  });

  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const result = await callToolAsTask(client, 'generate_test_plan', {
      diff: SAMPLE_DIFF,
      repository: 'org/repo',
      maxTestCases: 2,
    });

    assert.notEqual(result.isError, true);
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.ok, true);
    const structuredResult = result.structuredContent.result as {
      testCases: unknown[];
    };
    assert.equal(structuredResult.testCases.length, 2);
  } finally {
    await close();
  }
});

test('inspect_code_quality returns budget error when context chars exceeded', async () => {
  process.env.MAX_CONTEXT_CHARS = '20';
  resetMaxContextCharsCacheForTesting();

  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const result = await callToolAsTask(client, 'inspect_code_quality', {
      diff: SAMPLE_DIFF,
      repository: 'org/repo',
    });

    assert.equal(result.isError, true);
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.ok, false);
    assert.equal(
      (result.structuredContent.error as { code: string }).code,
      'E_INPUT_TOO_LARGE'
    );
  } finally {
    await close();
    delete process.env.MAX_CONTEXT_CHARS;
    resetMaxContextCharsCacheForTesting();
  }
});
