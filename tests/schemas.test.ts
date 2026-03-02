import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { z } from 'zod';

import {
  AnalyzeComplexityInputSchema,
  AnalyzePrImpactInputSchema,
  DetectApiBreakingInputSchema,
  GenerateReviewSummaryInputSchema,
  GenerateTestPlanInputSchema,
  WebSearchInputSchema,
} from '../src/schemas/inputs.js';
import {
  AnalyzeComplexityResultSchema,
  DefaultOutputSchema,
  DetectApiBreakingResultSchema,
  PrImpactResultSchema,
  ReviewSummaryResultSchema,
  TestPlanResultSchema,
} from '../src/schemas/outputs.js';

describe('input schemas', () => {
  it('AnalyzePrImpactInputSchema accepts valid input', () => {
    const result = AnalyzePrImpactInputSchema.safeParse({
      repository: 'owner/repo',
      language: 'TypeScript',
    });
    assert.equal(result.success, true);
  });

  it('AnalyzePrImpactInputSchema accepts minimal input', () => {
    const result = AnalyzePrImpactInputSchema.safeParse({
      repository: 'x',
    });
    assert.equal(result.success, true);
  });

  it('AnalyzePrImpactInputSchema rejects empty repository', () => {
    const result = AnalyzePrImpactInputSchema.safeParse({
      repository: '',
    });
    assert.equal(result.success, false);
  });

  it('AnalyzePrImpactInputSchema rejects unknown fields', () => {
    const result = AnalyzePrImpactInputSchema.safeParse({
      repository: 'owner/repo',
      unknown: true,
    });
    assert.equal(result.success, false);
  });

  it('GenerateTestPlanInputSchema validates maxTestCases bounds', () => {
    const tooLow = GenerateTestPlanInputSchema.safeParse({
      repository: 'owner/repo',
      maxTestCases: 0,
    });
    assert.equal(tooLow.success, false);

    const tooHigh = GenerateTestPlanInputSchema.safeParse({
      repository: 'owner/repo',
      maxTestCases: 31,
    });
    assert.equal(tooHigh.success, false);

    const valid = GenerateTestPlanInputSchema.safeParse({
      repository: 'owner/repo',
      maxTestCases: 15,
    });
    assert.equal(valid.success, true);
  });

  it('GenerateTestPlanInputSchema rejects non-integer maxTestCases', () => {
    const result = GenerateTestPlanInputSchema.safeParse({
      repository: 'owner/repo',
      maxTestCases: 5.5,
    });
    assert.equal(result.success, false);
  });

  it('WebSearchInputSchema rejects empty query', () => {
    const result = WebSearchInputSchema.safeParse({ query: '' });
    assert.equal(result.success, false);
  });

  it('AnalyzeComplexityInputSchema and DetectApiBreakingInputSchema share language', () => {
    for (const schema of [
      AnalyzeComplexityInputSchema,
      DetectApiBreakingInputSchema,
    ]) {
      const withLang = schema.safeParse({ language: 'Go' });
      assert.equal(withLang.success, true);

      const without = schema.safeParse({});
      assert.equal(without.success, true);

      const tooShort = schema.safeParse({ language: 'x' });
      assert.equal(tooShort.success, false);
    }
  });

  it('GenerateReviewSummaryInputSchema matches AnalyzePrImpactInputSchema shape', () => {
    const input = { repository: 'owner/repo', language: 'Rust' };
    assert.equal(
      GenerateReviewSummaryInputSchema.safeParse(input).success,
      true
    );
    assert.equal(AnalyzePrImpactInputSchema.safeParse(input).success, true);
  });
});

describe('output schemas', () => {
  it('DefaultOutputSchema accepts success payload', () => {
    const result = DefaultOutputSchema.safeParse({
      ok: true,
      result: { data: 'test' },
    });
    assert.equal(result.success, true);
  });

  it('DefaultOutputSchema accepts error payload with all fields', () => {
    const result = DefaultOutputSchema.safeParse({
      ok: false,
      error: {
        code: 'E_TEST',
        message: 'test error',
        retryable: true,
        kind: 'upstream',
      },
    });
    assert.equal(result.success, true);
  });

  it('DefaultOutputSchema rejects invalid error kind', () => {
    const result = DefaultOutputSchema.safeParse({
      ok: false,
      error: {
        code: 'E_TEST',
        message: 'test',
        kind: 'nonexistent',
      },
    });
    assert.equal(result.success, false);
  });

  it('PrImpactResultSchema accepts valid result', () => {
    const result = PrImpactResultSchema.safeParse({
      severity: 'medium',
      categories: ['bug_fix', 'api_change'],
      summary: 'Fixed a critical bug in the API layer.',
      breakingChanges: [],
      affectedAreas: ['src/api/handler.ts'],
      rollbackComplexity: 'trivial',
    });
    assert.equal(result.success, true);
  });

  it('PrImpactResultSchema rejects invalid severity', () => {
    const result = PrImpactResultSchema.safeParse({
      severity: 'extreme',
      categories: [],
      summary: 'test',
      breakingChanges: [],
      affectedAreas: [],
      rollbackComplexity: 'trivial',
    });
    assert.equal(result.success, false);
  });

  it('ReviewSummaryResultSchema validates stats as integers', () => {
    const result = ReviewSummaryResultSchema.safeParse({
      summary: 'A minor refactor.',
      overallRisk: 'low',
      keyChanges: ['Renamed variable'],
      recommendation: 'Merge.',
      stats: { filesChanged: 1.5, linesAdded: 10, linesRemoved: 5 },
    });
    assert.equal(result.success, false);
  });

  it('ReviewSummaryResultSchema accepts valid result', () => {
    const result = ReviewSummaryResultSchema.safeParse({
      summary: 'A minor refactor.',
      overallRisk: 'low',
      keyChanges: ['Renamed variable'],
      recommendation: 'Merge.',
      stats: { filesChanged: 1, linesAdded: 10, linesRemoved: 5 },
    });
    assert.equal(result.success, true);
  });

  it('TestPlanResultSchema requires at least 1 test case', () => {
    const result = TestPlanResultSchema.safeParse({
      summary: 'Plan.',
      testCases: [],
      coverageSummary: 'None.',
    });
    assert.equal(result.success, false);
  });

  it('AnalyzeComplexityResultSchema accepts valid result', () => {
    const result = AnalyzeComplexityResultSchema.safeParse({
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(1)',
      explanation: 'Single loop, constant space.',
      potentialBottlenecks: [],
      isDegradation: false,
    });
    assert.equal(result.success, true);
  });

  it('DetectApiBreakingResultSchema accepts zero breaking changes', () => {
    const result = DetectApiBreakingResultSchema.safeParse({
      hasBreakingChanges: false,
      breakingChanges: [],
    });
    assert.equal(result.success, true);
  });

  it('DetectApiBreakingResultSchema validates breaking change structure', () => {
    const result = DetectApiBreakingResultSchema.safeParse({
      hasBreakingChanges: true,
      breakingChanges: [
        {
          element: 'UserService.getUser()',
          natureOfChange: 'Parameter removed',
          consumerImpact: 'All callers must update signature',
          suggestedMitigation: 'Add overload with old signature',
        },
      ],
    });
    assert.equal(result.success, true);
  });
});

describe('z.toJSONSchema integration', () => {
  it('all output schemas produce valid JSON Schema', () => {
    const schemas = [
      DefaultOutputSchema,
      PrImpactResultSchema,
      ReviewSummaryResultSchema,
      TestPlanResultSchema,
      AnalyzeComplexityResultSchema,
      DetectApiBreakingResultSchema,
    ];

    for (const schema of schemas) {
      const jsonSchema = z.toJSONSchema(schema, { target: 'draft-2020-12' });
      assert.equal(typeof jsonSchema, 'object');
      assert.ok(jsonSchema !== null);
      assert.ok(
        'type' in jsonSchema ||
          '$ref' in jsonSchema ||
          'properties' in jsonSchema
      );
    }
  });

  it('all input schemas produce valid JSON Schema', () => {
    const schemas = [
      AnalyzePrImpactInputSchema,
      GenerateReviewSummaryInputSchema,
      GenerateTestPlanInputSchema,
      AnalyzeComplexityInputSchema,
      DetectApiBreakingInputSchema,
      WebSearchInputSchema,
    ];

    for (const schema of schemas) {
      const jsonSchema = z.toJSONSchema(schema, { target: 'draft-2020-12' });
      assert.equal(typeof jsonSchema, 'object');
      assert.ok(jsonSchema !== null);
    }
  });
});
