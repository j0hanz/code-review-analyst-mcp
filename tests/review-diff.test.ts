import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateDiffBudget } from '../src/lib/diff-budget.js';
import { ReviewDiffInputSchema } from '../src/schemas/inputs.js';
import { ReviewDiffResultSchema } from '../src/schemas/outputs.js';
import { registerAllTools } from '../src/tools/index.js';
import { applyFindingsTransform } from '../src/tools/review-diff.js';

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

test('ReviewDiffInputSchema accepts pre-stripped input — simulating MCP SDK behavior', () => {
  // The MCP SDK strips unknown fields before the tool handler runs.
  // This test documents that the schema correctly handles already-stripped input,
  // which is the actual input shape the handler receives at runtime.
  const parsed = ReviewDiffInputSchema.safeParse({
    diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
    repository: 'acme/widgets',
    // No unknown fields — the SDK has already removed them.
  });

  assert.equal(parsed.success, true);
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

test('ReviewDiffInputSchema rejects diff exceeding 120,000 chars', () => {
  const parsed = ReviewDiffInputSchema.safeParse({
    diff: 'x'.repeat(120_001),
    repository: 'acme/widgets',
  });

  assert.equal(parsed.success, false);
});

test('ReviewDiffInputSchema accepts diff at exactly 120,000 chars', () => {
  const parsed = ReviewDiffInputSchema.safeParse({
    diff: 'x'.repeat(120_000),
    repository: 'acme/widgets',
  });

  assert.equal(parsed.success, true);
});

test('validateDiffBudget enriched error has providedChars and maxChars in result', () => {
  const oldMaxDiffChars = process.env.MAX_DIFF_CHARS;
  process.env.MAX_DIFF_CHARS = '120000';

  try {
    const diff = 'x'.repeat(120_001);
    const error = validateDiffBudget(diff);

    assert.ok(error);
    assert.equal(error.structuredContent.ok, false);
    assert.equal(error.structuredContent.error?.code, 'E_INPUT_TOO_LARGE');
    assert.equal(error.structuredContent.error?.kind, 'budget');
    assert.equal(error.structuredContent.error?.retryable, false);

    const result = error.structuredContent.result as Record<string, unknown>;
    assert.ok(
      typeof result.providedChars === 'number',
      'Expected providedChars to be a number'
    );
    assert.ok(
      typeof result.maxChars === 'number',
      'Expected maxChars to be a number'
    );
    assert.equal(result.providedChars, 120_001);
    assert.equal(result.maxChars, 120_000);
  } finally {
    if (oldMaxDiffChars === undefined) {
      delete process.env.MAX_DIFF_CHARS;
    } else {
      process.env.MAX_DIFF_CHARS = oldMaxDiffChars;
    }
  }
});

const makeFinding = (
  severity: 'critical' | 'high' | 'medium' | 'low',
  idx: number
) => ({
  severity,
  file: `src/file${idx.toString()}.ts`,
  line: idx,
  title: `Finding ${idx.toString()} title here`,
  explanation: `Explanation for finding ${idx.toString()} here.`,
  recommendation: `Recommendation for finding ${idx.toString()} here.`,
});

test('applyFindingsTransform sorts findings critical→low', () => {
  const input = {
    diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
    repository: 'acme/widgets',
  };
  const result = {
    summary: 'Sort test summary text here.',
    overallRisk: 'high' as const,
    findings: [
      makeFinding('low', 1),
      makeFinding('critical', 2),
      makeFinding('medium', 3),
      makeFinding('high', 4),
    ],
    testsNeeded: [],
  };

  const transformed = applyFindingsTransform(input, result) as typeof result;

  assert.equal(transformed.findings[0]?.severity, 'critical');
  assert.equal(transformed.findings[1]?.severity, 'high');
  assert.equal(transformed.findings[2]?.severity, 'medium');
  assert.equal(transformed.findings[3]?.severity, 'low');
});

test('applyFindingsTransform clamps findings to maxFindings', () => {
  const input = {
    diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
    repository: 'acme/widgets',
    maxFindings: 2,
  };
  const result = {
    summary: 'Clamp test summary text here.',
    overallRisk: 'medium' as const,
    findings: [
      makeFinding('critical', 1),
      makeFinding('high', 2),
      makeFinding('medium', 3),
    ],
    testsNeeded: [],
  };

  const transformed = applyFindingsTransform(input, result) as typeof result;

  assert.equal(transformed.findings.length, 2);
  assert.equal(transformed.findings[0]?.severity, 'critical');
  assert.equal(transformed.findings[1]?.severity, 'high');
});
