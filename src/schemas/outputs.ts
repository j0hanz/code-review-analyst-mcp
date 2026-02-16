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

export const DefaultOutputSchema = z.strictObject({
  ok: z.boolean().describe('Whether the tool completed successfully.'),
  result: z.unknown().optional().describe('Successful result payload.'),
  error: z
    .strictObject({
      code: z.string().describe('Stable error code for callers.'),
      message: z.string().describe('Human readable error details.'),
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
  title: z
    .string()
    .min(OUTPUT_LIMITS.reviewFinding.title.min)
    .max(OUTPUT_LIMITS.reviewFinding.title.max)
    .describe('Short finding title.'),
  explanation: z
    .string()
    .min(OUTPUT_LIMITS.reviewFinding.text.min)
    .max(OUTPUT_LIMITS.reviewFinding.text.max)
    .describe('Why this issue matters.'),
  recommendation: z
    .string()
    .min(OUTPUT_LIMITS.reviewFinding.text.min)
    .max(OUTPUT_LIMITS.reviewFinding.text.max)
    .describe('Concrete fix recommendation.'),
});

export const ReviewDiffResultSchema = z.strictObject({
  summary: z
    .string()
    .min(OUTPUT_LIMITS.reviewDiffResult.summary.min)
    .max(OUTPUT_LIMITS.reviewDiffResult.summary.max)
    .describe('Short review summary.'),
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
      z
        .string()
        .min(OUTPUT_LIMITS.reviewDiffResult.testsNeeded.itemMin)
        .max(OUTPUT_LIMITS.reviewDiffResult.testsNeeded.itemMax)
        .describe('Test recommendation to reduce risk.')
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
      z
        .string()
        .min(OUTPUT_LIMITS.riskScoreResult.rationale.itemMin)
        .max(OUTPUT_LIMITS.riskScoreResult.rationale.itemMax)
        .describe('Reason that influenced the final score.')
    )
    .min(OUTPUT_LIMITS.riskScoreResult.rationale.minItems)
    .max(OUTPUT_LIMITS.riskScoreResult.rationale.maxItems)
    .describe('Evidence-based explanation for the score.'),
});

export const PatchSuggestionResultSchema = z.strictObject({
  summary: z
    .string()
    .min(OUTPUT_LIMITS.patchSuggestionResult.summary.min)
    .max(OUTPUT_LIMITS.patchSuggestionResult.summary.max)
    .describe('Short patch strategy summary.'),
  patch: z
    .string()
    .min(OUTPUT_LIMITS.patchSuggestionResult.patch.min)
    .max(OUTPUT_LIMITS.patchSuggestionResult.patch.max)
    .describe('Unified diff patch text.'),
  validationChecklist: z
    .array(
      z
        .string()
        .min(OUTPUT_LIMITS.patchSuggestionResult.checklist.itemMin)
        .max(OUTPUT_LIMITS.patchSuggestionResult.checklist.itemMax)
        .describe('Validation step after applying patch.')
    )
    .min(OUTPUT_LIMITS.patchSuggestionResult.checklist.minItems)
    .max(OUTPUT_LIMITS.patchSuggestionResult.checklist.maxItems)
    .describe('Post-change validation actions.'),
});
