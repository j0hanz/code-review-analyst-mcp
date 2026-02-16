import assert from 'node:assert/strict';
import { test } from 'node:test';

import { zodToJsonSchema } from 'zod-to-json-schema';

import { validateDiffBudget } from '../src/lib/diff-budget.js';
import { RiskScoreInputSchema } from '../src/schemas/inputs.js';
import {
  RiskScoreGeminiSchema,
  RiskScoreResultSchema,
} from '../src/schemas/outputs.js';

test('RiskScoreInputSchema rejects unknown fields', () => {
  const parsed = RiskScoreInputSchema.safeParse({
    diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
    extraField: 'not allowed',
  });

  assert.equal(parsed.success, false);
});

test('RiskScoreInputSchema accepts valid input with deploymentCriticality', () => {
  const parsed = RiskScoreInputSchema.safeParse({
    diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
    deploymentCriticality: 'high',
  });

  assert.equal(parsed.success, true);
});

test('RiskScoreInputSchema rejects invalid deploymentCriticality value', () => {
  const parsed = RiskScoreInputSchema.safeParse({
    diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
    deploymentCriticality: 'extreme',
  });

  assert.equal(parsed.success, false);
});

test('RiskScoreResultSchema validates expected payload shape', () => {
  const parsed = RiskScoreResultSchema.parse({
    score: 72,
    bucket: 'high',
    rationale: ['Changes auth middleware with no tests covering the new path.'],
  });

  assert.equal(parsed.score, 72);
  assert.equal(parsed.bucket, 'high');
  assert.equal(parsed.rationale.length, 1);
});

test('RiskScoreResultSchema rejects score outside 0-100 range', () => {
  const parsed = RiskScoreResultSchema.safeParse({
    score: 150,
    bucket: 'critical',
    rationale: ['Out of range score test.'],
  });

  assert.equal(parsed.success, false);
});

test('RiskScoreGeminiSchema accepts valid payload without bounds', () => {
  const parsed = RiskScoreGeminiSchema.safeParse({
    score: 200,
    bucket: 'high',
    rationale: ['x'],
  });

  assert.equal(parsed.success, true);
});

test('RiskScoreGeminiSchema converts to JSON Schema', () => {
  const jsonSchema = zodToJsonSchema(RiskScoreGeminiSchema);

  assert.equal(typeof jsonSchema, 'object');
  assert.ok('properties' in jsonSchema);
});

test('validateDiffBudget formats diff budget error message with en-US separators', () => {
  const oldMaxDiffChars = process.env.MAX_DIFF_CHARS;
  process.env.MAX_DIFF_CHARS = '120000';

  try {
    const diff = 'x'.repeat(120_001);
    const error = validateDiffBudget(diff);

    assert.ok(error);
    assert.equal(error.structuredContent.ok, false);
    assert.equal(error.structuredContent.error?.code, 'E_INPUT_TOO_LARGE');

    const message = error.structuredContent.error?.message ?? '';
    assert.ok(message.includes('120,001'), 'Expected formatted diff length');
    assert.ok(message.includes('120,000'), 'Expected formatted max diff chars');
  } finally {
    if (oldMaxDiffChars === undefined) {
      delete process.env.MAX_DIFF_CHARS;
    } else {
      process.env.MAX_DIFF_CHARS = oldMaxDiffChars;
    }
  }
});
