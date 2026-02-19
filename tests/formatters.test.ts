import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatReviewOutput } from '../src/tools/review-diff.js';
import { formatRiskOutput } from '../src/tools/risk-score.js';
import { formatPatchOutput } from '../src/tools/suggest-patch.js';

test('formatReviewOutput summarizes findings correctly', () => {
  const result = {
    summary: 'Test summary.',
    overallRisk: 'high',
    findings: [{ severity: 'high' }, { severity: 'high' }, { severity: 'low' }],
    testsNeeded: [],
  };

  const output = formatReviewOutput(result);
  assert.match(output, /Review Complete: HIGH risk/);
  assert.match(output, /Found 3 issues/);
  assert.match(output, /2 high/);
  assert.match(output, /1 low/);
});

test('formatRiskOutput summarizes risk score correctly', () => {
  const result = {
    score: 85,
    bucket: 'high',
    rationale: [],
  };

  const output = formatRiskOutput(result);
  assert.match(output, /Risk Score: 85\/100/);
  assert.match(output, /\(HIGH\)/);
});

test('formatPatchOutput summarizes patch correctly', () => {
  const result = {
    summary: 'Apply fix for null check.',
    patch: 'diff...',
    validationChecklist: [],
  };

  const output = formatPatchOutput(result);
  assert.match(output, /Patch Generated: Apply fix for null check/);
});
