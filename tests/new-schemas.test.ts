import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AnalyzePrImpactInputSchema,
  SuggestSearchReplaceInputSchema,
} from '../src/schemas/inputs.js';

describe('New Schemas', () => {
  it('validates AnalyzePrImpactInputSchema', () => {
    const input = {
      diff: 'diff --git a/file b/file\nindex ...',
      repository: 'org/repo',
      language: 'TypeScript',
    };
    const parsed = AnalyzePrImpactInputSchema.parse(input);
    assert.deepEqual(parsed, input);
  });

  it('validates SuggestSearchReplaceInputSchema', () => {
    const input = {
      diff: 'diff --git a/file b/file\nindex ...',
      findingTitle: 'Bug in foo',
      findingDetails: 'Details about bug which is long enough',
    };
    const parsed = SuggestSearchReplaceInputSchema.parse(input);
    assert.deepEqual(parsed, input);
  });

  it('rejects unknown fields', () => {
    assert.throws(() => {
      AnalyzePrImpactInputSchema.parse({
        diff: 'diff --git ...',
        repository: 'repo',
        extra: 'field',
      });
    });
  });
});
