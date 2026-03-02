import { z } from 'zod';

import { createBoundedString, createBoundedStringArray } from './helpers.js';

const OUTPUT_LIMITS = {
  reviewDiffResult: {
    summary: { min: 1, max: 2_000 },
    findingsMax: 50,
    testsNeeded: { minItems: 0, maxItems: 20, itemMin: 1, itemMax: 300 },
  },
  complexity: {
    timeComplexity: { min: 1, max: 200 },
    spaceComplexity: { min: 1, max: 200 },
    explanation: { min: 1, max: 2_000 },
    bottleneck: { min: 1, max: 500, maxItems: 10 },
  },
  apiBreaking: {
    element: { min: 1, max: 300 },
    natureOfChange: { min: 1, max: 500 },
    consumerImpact: { min: 1, max: 500 },
    suggestedMitigation: { min: 1, max: 500 },
    maxItems: 20,
  },
} as const;

const QUALITY_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
const MERGE_RISK_LEVELS = ['low', 'medium', 'high'] as const;
const REVIEW_SUMMARY_LIMITS = OUTPUT_LIMITS.reviewDiffResult.summary;
const ERROR_KINDS = [
  'validation',
  'budget',
  'upstream',
  'timeout',
  'cancelled',
  'busy',
  'internal',
] as const;

function createReviewSummarySchema(description: string): z.ZodString {
  return z
    .string()
    .min(REVIEW_SUMMARY_LIMITS.min)
    .max(REVIEW_SUMMARY_LIMITS.max)
    .describe(description);
}

const mergeRiskSchema = z
  .enum(MERGE_RISK_LEVELS)
  .describe('High-level merge risk.');

export const DefaultOutputSchema = z.strictObject({
  ok: z.boolean().describe('Whether the tool completed successfully.'),
  result: z.unknown().optional().describe('Successful result payload.'),
  error: z
    .strictObject({
      code: z.string().describe('Stable error code for callers.'),
      message: z.string().describe('Human readable error details.'),
      retryable: z
        .boolean()
        .optional()
        .describe('Whether the client should retry this request.'),
      kind: z
        .enum(ERROR_KINDS)
        .optional()
        .describe('Machine-readable error category.'),
    })
    .optional()
    .describe('Error payload when ok is false.'),
});

export const PrImpactResultSchema = z.strictObject({
  severity: z.enum(QUALITY_RISK_LEVELS).describe('Overall severity.'),
  categories: z
    .array(
      z.enum([
        'breaking_change',
        'api_change',
        'schema_change',
        'config_change',
        'dependency_update',
        'security_fix',
        'deprecation',
        'performance_change',
        'bug_fix',
        'feature_addition',
      ])
    )
    .min(0)
    .max(10)
    .describe('Impact categories.'),
  summary: z.string().min(1).max(1000).describe('Concise summary.'),
  breakingChanges: createBoundedStringArray(
    1,
    500,
    0,
    10,
    'Specific breaking changes.'
  ),
  affectedAreas: createBoundedStringArray(
    1,
    200,
    0,
    20,
    'Impacted subsystems/files.'
  ),
  rollbackComplexity: z
    .enum(['trivial', 'moderate', 'complex', 'irreversible'])
    .describe('Revert difficulty.'),
});

export const ReviewSummaryResultSchema = z.strictObject({
  summary: createReviewSummarySchema('PR summary.'),
  overallRisk: mergeRiskSchema,
  keyChanges: createBoundedStringArray(
    1,
    300,
    1,
    15,
    'Key changes (significance desc).'
  ),
  recommendation: z.string().min(1).max(500).describe('Merge recommendation.'),
  stats: z
    .strictObject({
      filesChanged: z.int().min(0).describe('Files changed.'),
      linesAdded: z.int().min(0).describe('Lines added.'),
      linesRemoved: z.int().min(0).describe('Lines removed.'),
    })
    .describe('Change statistics (computed from diff before Gemini call).'),
});

export const TestCaseSchema = z.strictObject({
  name: z.string().min(1).max(200).describe('Test case name.'),
  type: z
    .enum([
      'unit',
      'integration',
      'e2e',
      'regression',
      'security',
      'performance',
    ])
    .describe('Test category.'),
  file: z.string().min(1).max(500).describe('Test file path.'),
  description: z.string().min(1).max(1000).describe('Verification goal.'),
  pseudoCode: z.string().min(1).max(2000).describe('Pseudocode/starter.'),
  priority: z
    .enum(['must_have', 'should_have', 'nice_to_have'])
    .describe('Priority.'),
});

export const TestPlanResultSchema = z.strictObject({
  summary: z.string().min(1).max(1000).describe('Plan overview.'),
  testCases: z
    .array(TestCaseSchema)
    .min(1)
    .max(30)
    .describe('Test cases (must_have first).'),
  coverageSummary: z
    .string()
    .min(1)
    .max(500)
    .describe('Coverage gaps addressed.'),
});

export const AnalyzeComplexityResultSchema = z.strictObject({
  timeComplexity: createBoundedString(
    OUTPUT_LIMITS.complexity.timeComplexity.min,
    OUTPUT_LIMITS.complexity.timeComplexity.max,
    'Big-O time complexity (e.g. O(n log n)).'
  ),
  spaceComplexity: createBoundedString(
    OUTPUT_LIMITS.complexity.spaceComplexity.min,
    OUTPUT_LIMITS.complexity.spaceComplexity.max,
    'Big-O space complexity (e.g. O(n)).'
  ),
  explanation: createBoundedString(
    OUTPUT_LIMITS.complexity.explanation.min,
    OUTPUT_LIMITS.complexity.explanation.max,
    'Analysis explanation (loops, recursion).'
  ),
  potentialBottlenecks: createBoundedStringArray(
    OUTPUT_LIMITS.complexity.bottleneck.min,
    OUTPUT_LIMITS.complexity.bottleneck.max,
    0,
    OUTPUT_LIMITS.complexity.bottleneck.maxItems,
    'Potential bottlenecks.'
  ),
  isDegradation: z.boolean().describe('True if degradation vs original.'),
});

export const DetectApiBreakingResultSchema = z.strictObject({
  hasBreakingChanges: z.boolean().describe('True if breaking.'),
  breakingChanges: z
    .array(
      z.strictObject({
        element: createBoundedString(
          OUTPUT_LIMITS.apiBreaking.element.min,
          OUTPUT_LIMITS.apiBreaking.element.max,
          'Changed element (signature/field/export).'
        ),
        natureOfChange: createBoundedString(
          OUTPUT_LIMITS.apiBreaking.natureOfChange.min,
          OUTPUT_LIMITS.apiBreaking.natureOfChange.max,
          'Change details & breaking reason.'
        ),
        consumerImpact: createBoundedString(
          OUTPUT_LIMITS.apiBreaking.consumerImpact.min,
          OUTPUT_LIMITS.apiBreaking.consumerImpact.max,
          'Consumer impact.'
        ),
        suggestedMitigation: createBoundedString(
          OUTPUT_LIMITS.apiBreaking.suggestedMitigation.min,
          OUTPUT_LIMITS.apiBreaking.suggestedMitigation.max,
          'Mitigation strategy.'
        ),
      })
    )
    .min(0)
    .max(OUTPUT_LIMITS.apiBreaking.maxItems)
    .describe('Breaking changes list.'),
});

export type DefaultOutput = z.infer<typeof DefaultOutputSchema>;
export type PrImpactResult = z.infer<typeof PrImpactResultSchema>;
export type ReviewSummaryResult = z.infer<typeof ReviewSummaryResultSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type TestPlanResult = z.infer<typeof TestPlanResultSchema>;
export type AnalyzeComplexityResult = z.infer<
  typeof AnalyzeComplexityResultSchema
>;
export type DetectApiBreakingResult = z.infer<
  typeof DetectApiBreakingResultSchema
>;
