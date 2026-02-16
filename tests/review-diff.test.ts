import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ReviewDiffInputSchema } from '../src/schemas/inputs.js';
import { ReviewDiffResultSchema } from '../src/schemas/outputs.js';
import { registerAllTools } from '../src/tools/index.js';

test('registerAllTools does not throw', () => {
  const server = new McpServer({
    name: 'test-server',
    version: '0.0.0',
  });

  assert.doesNotThrow(() => {
    registerAllTools(server);
  });
});

test('ReviewDiffInputSchema rejects unknown fields', () => {
  const parsed = ReviewDiffInputSchema.safeParse({
    diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
    repository: 'acme/widgets',
    extraField: 'not allowed',
  });

  assert.equal(parsed.success, false);
});

test('ReviewDiffResultSchema validates expected payload shape', () => {
  const parsed = ReviewDiffResultSchema.parse({
    summary: 'One high-risk change around auth flow.',
    overallRisk: 'high',
    findings: [
      {
        severity: 'high',
        file: 'src/auth.ts',
        line: 42,
        title: 'Missing null check',
        explanation: 'Null response can throw and break login.',
        recommendation: 'Guard for null before property access.',
      },
    ],
    testsNeeded: ['Add auth null-path regression test'],
  });

  assert.equal(parsed.findings.length, 1);
});
