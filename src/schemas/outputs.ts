import { z } from 'zod';

const OUTPUT_LIMITS = {
  reviewFinding: {
    fileMax: 260,
    lineMin: 1,
    lineMax: 1_000_000,
    title: { min: 3, max: 160 },
    text: { min: 1, max: 2_000 },
  },
  reviewDiffResult: {
    summary: { min: 1, max: 2_000 },
    findingsMax: 50,
    testsNeeded: { minItems: 0, maxItems: 20, itemMin: 1, itemMax: 300 },
  },
} as const;

const QUALITY_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
const MERGE_RISK_LEVELS = ['low', 'medium', 'high'] as const;
const ERROR_KINDS = [
  'validation',
  'budget',
  'upstream',
  'timeout',
  'cancelled',
  'internal',
] as const;

function createBoundedString(
  min: number,
  max: number,
  description: string
): z.ZodString {
  return z.string().min(min).max(max).describe(description);
}

function createBoundedStringArray(
  itemMin: number,
  itemMax: number,
  minItems: number,
  maxItems: number,
  description: string
): z.ZodArray<z.ZodString> {
  return z
    .array(z.string().min(itemMin).max(itemMax))
    .min(minItems)
    .max(maxItems)
    .describe(description);
}

function createReviewSummarySchema(description: string): z.ZodString {
  return z
    .string()
    .min(OUTPUT_LIMITS.reviewDiffResult.summary.min)
    .max(OUTPUT_LIMITS.reviewDiffResult.summary.max)
    .describe(description);
}

const reviewFindingSeveritySchema = z
  .enum(QUALITY_RISK_LEVELS)
  .describe('Severity for this issue.');
const qualityRiskSchema = z
  .enum(QUALITY_RISK_LEVELS)
  .describe('Overall risk with full context.');
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

export const ReviewFindingSchema = z.strictObject({
  severity: reviewFindingSeveritySchema,
  file: z
    .string()
    .min(1)
    .max(OUTPUT_LIMITS.reviewFinding.fileMax)
    .describe('File path for the finding.'),
  line: z
    .number()
    .int()
    .min(OUTPUT_LIMITS.reviewFinding.lineMin)
    .max(OUTPUT_LIMITS.reviewFinding.lineMax)
    .nullable()
    .describe('1-based line number when known, otherwise null.'),
  title: createBoundedString(
    OUTPUT_LIMITS.reviewFinding.title.min,
    OUTPUT_LIMITS.reviewFinding.title.max,
    'Short finding title.'
  ),
  explanation: createBoundedString(
    OUTPUT_LIMITS.reviewFinding.text.min,
    OUTPUT_LIMITS.reviewFinding.text.max,
    'What the issue is and its runtime, security, or correctness impact.'
  ),
  recommendation: createBoundedString(
    OUTPUT_LIMITS.reviewFinding.text.min,
    OUTPUT_LIMITS.reviewFinding.text.max,
    'Concrete fix - name the exact code, function, or pattern to change.'
  ),
});

const CODE_QUALITY_SHARED_FIELDS = {
  summary: createReviewSummarySchema('Deep-dive review summary.'),
  overallRisk: qualityRiskSchema,
  findings: z
    .array(ReviewFindingSchema)
    .min(0)
    .max(30)
    .describe('Findings ordered by severity, highest first.'),
  testsNeeded: createBoundedStringArray(
    1,
    300,
    0,
    12,
    'Test cases needed to validate this change.'
  ),
  contextualInsights: createBoundedStringArray(
    1,
    500,
    0,
    5,
    'Cross-file insights only discoverable from the full file context. Omit when no file context was provided.'
  ),
} as const;

export const PrImpactResultSchema = z.strictObject({
  severity: z.enum(QUALITY_RISK_LEVELS).describe('Overall impact severity.'),
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
    .describe('Impact categories detected in the diff.'),
  summary: z.string().min(1).max(1000).describe('Concise impact summary.'),
  breakingChanges: createBoundedStringArray(
    1,
    500,
    0,
    10,
    'Specific breaking changes identified.'
  ),
  affectedAreas: createBoundedStringArray(
    1,
    200,
    0,
    20,
    'Subsystems or files impacted.'
  ),
  rollbackComplexity: z
    .enum(['trivial', 'moderate', 'complex', 'irreversible'])
    .describe('Estimated difficulty to revert this change.'),
});

export const ReviewSummaryResultSchema = z.strictObject({
  summary: createReviewSummarySchema('Human-readable PR summary.'),
  overallRisk: mergeRiskSchema,
  keyChanges: createBoundedStringArray(
    1,
    300,
    1,
    15,
    'Most important changes, ordered by significance.'
  ),
  recommendation: z
    .string()
    .min(1)
    .max(500)
    .describe('Merge readiness recommendation.'),
  stats: z
    .strictObject({
      filesChanged: z
        .number()
        .int()
        .min(0)
        .describe('Number of files changed.'),
      linesAdded: z.number().int().min(0).describe('Total lines added.'),
      linesRemoved: z.number().int().min(0).describe('Total lines removed.'),
    })
    .describe('Change statistics (computed from diff before Gemini call).'),
});

export const CodeQualityResultSchema = z.strictObject({
  ...CODE_QUALITY_SHARED_FIELDS,
});

export const CodeQualityOutputSchema = z.object({
  ...CODE_QUALITY_SHARED_FIELDS,
  totalFindings: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Total findings returned by Gemini before maxFindings capping was applied.'
    ),
});

export const SearchReplaceBlockSchema = z.strictObject({
  file: z.string().min(1).max(500).describe('File path to modify.'),
  search: z
    .string()
    .min(1)
    .max(5000)
    .describe(
      'Verbatim source text to find - character-exact including all whitespace and indentation.'
    ),
  replace: z
    .string()
    .min(0)
    .max(5000)
    .describe('Replacement text. Use empty string to delete.'),
  explanation: z
    .string()
    .min(1)
    .max(500)
    .describe('Why this patch fixes the finding.'),
});

export const SearchReplaceResultSchema = z.strictObject({
  summary: z.string().min(1).max(1000).describe('What the fix accomplishes.'),
  blocks: z
    .array(SearchReplaceBlockSchema)
    .min(1)
    .max(10)
    .describe('Search/replace operations to apply, in order.'),
  validationChecklist: createBoundedStringArray(
    1,
    300,
    1,
    12,
    'Steps to validate the fix after applying.'
  ),
});

export const TestCaseSchema = z.strictObject({
  name: z
    .string()
    .min(1)
    .max(200)
    .describe('Test case name or describe/it string.'),
  type: z
    .enum([
      'unit',
      'integration',
      'e2e',
      'regression',
      'security',
      'performance',
    ])
    .describe('Category of test.'),
  file: z.string().min(1).max(500).describe('Suggested test file path.'),
  description: z.string().min(1).max(1000).describe('What this test verifies.'),
  pseudoCode: z
    .string()
    .min(1)
    .max(2000)
    .describe('Pseudocode or starter implementation.'),
  priority: z
    .enum(['must_have', 'should_have', 'nice_to_have'])
    .describe('Priority relative to merge readiness.'),
});

export const TestPlanResultSchema = z.strictObject({
  summary: z.string().min(1).max(1000).describe('Test plan overview.'),
  testCases: z
    .array(TestCaseSchema)
    .min(1)
    .max(30)
    .describe('Ordered test cases, must_have first.'),
  coverageSummary: z
    .string()
    .min(1)
    .max(500)
    .describe('Summary of coverage gaps this plan addresses.'),
});
