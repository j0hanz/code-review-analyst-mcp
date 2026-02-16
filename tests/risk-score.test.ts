import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RiskScoreInputSchema } from '../src/schemas/inputs.js';
import { RiskScoreResultSchema } from '../src/schemas/outputs.js';

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
