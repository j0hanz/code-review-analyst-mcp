import { z } from 'zod';

const OUTPUT_LIMITS = {
  reviewFinding: {
    fileMax: 260,
    lineMin: 1,
    lineMax: 1_000_000,
    title: { min: 3, max: 160 },
    text: { min: 10, max: 2_000 },
  },
  reviewDiffResult: {
    summary: { min: 10, max: 2_000 },
    findingsMax: 30,
    testsNeeded: { minItems: 0, maxItems: 12, itemMin: 5, itemMax: 300 },
  },
  riskScoreResult: {
    score: { min: 0, max: 100 },
    rationale: { minItems: 1, maxItems: 10, itemMin: 8, itemMax: 500 },
  },
  patchSuggestionResult: {
    summary: { min: 10, max: 1_000 },
    patch: { min: 10, max: 60_000 },
    checklist: { minItems: 1, maxItems: 12, itemMin: 6, itemMax: 300 },
  },
} as const;

function createBoundedString(
  min: number,
  max: number,
  description: string
): z.ZodString {
  return z.string().min(min).max(max).describe(description);
}

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
        .enum([
          'validation',
          'budget',
          'upstream',
          'timeout',
          'cancelled',
          'internal',
        ])
        .optional()
        .describe('Machine-readable error category.'),
    })
    .optional()
    .describe('Error payload when ok is false.'),
});

export const ReviewFindingSchema = z.strictObject({
  severity: z
    .enum(['low', 'medium', 'high', 'critical'])
    .describe('Severity for this issue.'),
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
    'Why this issue matters.'
  ),
  recommendation: createBoundedString(
    OUTPUT_LIMITS.reviewFinding.text.min,
    OUTPUT_LIMITS.reviewFinding.text.max,
    'Concrete fix recommendation.'
  ),
});

export const ReviewDiffResultSchema = z.strictObject({
  summary: createBoundedString(
    OUTPUT_LIMITS.reviewDiffResult.summary.min,
    OUTPUT_LIMITS.reviewDiffResult.summary.max,
    'Short review summary.'
  ),
  overallRisk: z
    .enum(['low', 'medium', 'high'])
    .describe('Overall risk for merging this diff.'),
  findings: z
    .array(ReviewFindingSchema.describe('Single code review finding.'))
    .min(0)
    .max(OUTPUT_LIMITS.reviewDiffResult.findingsMax)
    .describe('Ordered list of findings, highest severity first.'),
  testsNeeded: z
    .array(
      createBoundedString(
        OUTPUT_LIMITS.reviewDiffResult.testsNeeded.itemMin,
        OUTPUT_LIMITS.reviewDiffResult.testsNeeded.itemMax,
        'Test recommendation to reduce risk.'
      )
    )
    .min(OUTPUT_LIMITS.reviewDiffResult.testsNeeded.minItems)
    .max(OUTPUT_LIMITS.reviewDiffResult.testsNeeded.maxItems)
    .describe('Targeted tests to add before merge.'),
});

export const RiskScoreResultSchema = z.strictObject({
  score: z
    .number()
    .int()
    .min(OUTPUT_LIMITS.riskScoreResult.score.min)
    .max(OUTPUT_LIMITS.riskScoreResult.score.max)
    .describe('Deployment risk score, where 100 is highest risk.'),
  bucket: z
    .enum(['low', 'medium', 'high', 'critical'])
    .describe('Risk bucket derived from score and criticality.'),
  rationale: z
    .array(
      createBoundedString(
        OUTPUT_LIMITS.riskScoreResult.rationale.itemMin,
        OUTPUT_LIMITS.riskScoreResult.rationale.itemMax,
        'Reason that influenced the final score.'
      )
    )
    .min(OUTPUT_LIMITS.riskScoreResult.rationale.minItems)
    .max(OUTPUT_LIMITS.riskScoreResult.rationale.maxItems)
    .describe('Evidence-based explanation for the score.'),
});

export const PatchSuggestionResultSchema = z.strictObject({
  summary: createBoundedString(
    OUTPUT_LIMITS.patchSuggestionResult.summary.min,
    OUTPUT_LIMITS.patchSuggestionResult.summary.max,
    'Short patch strategy summary.'
  ),
  patch: createBoundedString(
    OUTPUT_LIMITS.patchSuggestionResult.patch.min,
    OUTPUT_LIMITS.patchSuggestionResult.patch.max,
    'Unified diff patch text.'
  ),
  validationChecklist: z
    .array(
      createBoundedString(
        OUTPUT_LIMITS.patchSuggestionResult.checklist.itemMin,
        OUTPUT_LIMITS.patchSuggestionResult.checklist.itemMax,
        'Validation step after applying patch.'
      )
    )
    .min(OUTPUT_LIMITS.patchSuggestionResult.checklist.minItems)
    .max(OUTPUT_LIMITS.patchSuggestionResult.checklist.maxItems)
    .describe('Post-change validation actions.'),
});
