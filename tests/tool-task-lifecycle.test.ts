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
import { setDiffForTesting } from '../src/lib/diff-store.js';
import { setClientForTesting } from '../src/lib/gemini.js';
import {
  FLASH_TRIAGE_MAX_OUTPUT_TOKENS,
  PRO_REVIEW_MAX_OUTPUT_TOKENS,
} from '../src/lib/model-config.js';
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
  generatedAt: '2026-02-21T00:00:00.000Z',
  mode: 'unstaged',
} as const;

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

function assertNoProgressUpdates(updates: readonly Progress[]): void {
  assert.equal(
    updates.length,
    0,
    'Expected no progress notifications when progress bars are disabled'
  );
}

test('analyze_pr_impact returns cancelled outcome when upstream cancels', async () => {
  setMockClient(async () => {
    throw new Error('request cancelled by caller');
  });

  setDiffForTesting(SAMPLE_DIFF_SLOT);
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const progressUpdates: Progress[] = [];
    await assert.rejects(
      callToolAsTask(
        client,
        'analyze_pr_impact',
        { repository: 'org/repo' },
        {
          onprogress: (progress) => {
            progressUpdates.push(progress);
          },
        }
      )
    );
    assertNoProgressUpdates(progressUpdates);
  } finally {
    await close();
    setDiffForTesting(undefined);
  }
});

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

  setDiffForTesting(SAMPLE_DIFF_SLOT);
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const progressUpdates: Progress[] = [];
    const result = await callToolAsTask(
      client,
      'analyze_pr_impact',
      { repository: 'org/repo' },
      {
        onprogress: (progress) => {
          progressUpdates.push(progress);
        },
      }
    );

    assert.notEqual(result.isError, true);
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.ok, true);
    assertNoProgressUpdates(progressUpdates);
  } finally {
    await close();
    setDiffForTesting(undefined);
  }
});

test('analyze_pr_impact returns budget error without crashing task flow', async () => {
  process.env.MAX_DIFF_CHARS = '20';
  resetMaxDiffCharsCacheForTesting();
  setDiffForTesting(SAMPLE_DIFF_SLOT);

  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const progressUpdates: Progress[] = [];
    const result = await callToolAsTask(
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
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.ok, false);
    assert.equal(
      (result.structuredContent.error as { code: string }).code,
      'E_INPUT_TOO_LARGE'
    );
    assertNoProgressUpdates(progressUpdates);
  } finally {
    await close();
    setDiffForTesting(undefined);
    delete process.env.MAX_DIFF_CHARS;
    resetMaxDiffCharsCacheForTesting();
  }
});

test('analyze_pr_impact emits no schema retry progress when progress is disabled', async () => {
  let attempts = 0;
  setMockClient(async () => {
    attempts += 1;
    if (attempts === 1) {
      return {
        text: JSON.stringify({
          severity: 'low',
          categories: ['bug_fix'],
        }),
      };
    }

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

  try {
    const progressUpdates: Progress[] = [];
    const result = await callToolAsTask(
      client,
      'analyze_pr_impact',
      { repository: 'org/repo' },
      {
        onprogress: (progress) => {
          progressUpdates.push(progress);
        },
      }
    );

    assert.notEqual(result.isError, true);
    assertNoProgressUpdates(progressUpdates);
  } finally {
    await close();
    setDiffForTesting(undefined);
  }
});

test('tool boundary rejects unknown input fields', async () => {
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    await assert.rejects(
      callToolAsTask(client, 'analyze_pr_impact', {
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

  setDiffForTesting(SAMPLE_DIFF_SLOT);
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const result = await callToolAsTask(client, 'inspect_code_quality', {
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
    setDiffForTesting(undefined);
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

  setDiffForTesting(SAMPLE_DIFF_SLOT);
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const result = await callToolAsTask(client, 'generate_test_plan', {
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
    setDiffForTesting(undefined);
  }
});

test('inspect_code_quality returns budget error when context chars exceeded', async () => {
  process.env.MAX_CONTEXT_CHARS = '20';
  resetMaxContextCharsCacheForTesting();
  setDiffForTesting(SAMPLE_DIFF_SLOT);

  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const result = await callToolAsTask(client, 'inspect_code_quality', {
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
    setDiffForTesting(undefined);
    delete process.env.MAX_CONTEXT_CHARS;
    resetMaxContextCharsCacheForTesting();
  }
});

test('tool-specific maxOutputTokens are passed to Gemini calls', async () => {
  const observedMaxOutputTokens: number[] = [];
  setMockClient(async (...args: unknown[]) => {
    const [request] = args as [{ config: { maxOutputTokens?: number } }];
    observedMaxOutputTokens.push(request.config.maxOutputTokens ?? -1);

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

  try {
    await callToolAsTask(client, 'analyze_pr_impact', {
      repository: 'org/repo',
    });

    setMockClient(async (...args: unknown[]) => {
      const [request] = args as [{ config: { maxOutputTokens?: number } }];
      observedMaxOutputTokens.push(request.config.maxOutputTokens ?? -1);

      return {
        text: JSON.stringify({
          summary: 'Found one issue.',
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
          ],
          testsNeeded: [],
          contextualInsights: [],
        }),
      };
    });

    await callToolAsTask(client, 'inspect_code_quality', {
      repository: 'org/repo',
    });
  } finally {
    await close();
    setDiffForTesting(undefined);
  }

  assert.deepEqual(observedMaxOutputTokens, [
    FLASH_TRIAGE_MAX_OUTPUT_TOKENS,
    PRO_REVIEW_MAX_OUTPUT_TOKENS,
  ]);
});
