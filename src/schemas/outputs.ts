import { z } from 'zod';

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
  file: z.string().min(1).max(260).describe('File path for the finding.'),
  line: z
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .nullable()
    .describe('1-based line number when known, otherwise null.'),
  title: z.string().min(3).max(160).describe('Short finding title.'),
  explanation: z
    .string()
    .min(10)
    .max(2_000)
    .describe('Why this issue matters.'),
  recommendation: z
    .string()
    .min(10)
    .max(2_000)
    .describe('Concrete fix recommendation.'),
});

export const ReviewDiffResultSchema = z.strictObject({
  summary: z.string().min(10).max(2_000).describe('Short review summary.'),
  overallRisk: z
    .enum(['low', 'medium', 'high'])
    .describe('Overall risk for merging this diff.'),
  findings: z
    .array(ReviewFindingSchema.describe('Single code review finding.'))
    .min(0)
    .max(30)
    .describe('Ordered list of findings, highest severity first.'),
  testsNeeded: z
    .array(
      z.string().min(5).max(300).describe('Test recommendation to reduce risk.')
    )
    .min(0)
    .max(12)
    .describe('Targeted tests to add before merge.'),
});

export const RiskScoreResultSchema = z.strictObject({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Deployment risk score, where 100 is highest risk.'),
  bucket: z
    .enum(['low', 'medium', 'high', 'critical'])
    .describe('Risk bucket derived from score and criticality.'),
  rationale: z
    .array(
      z
        .string()
        .min(8)
        .max(500)
        .describe('Reason that influenced the final score.')
    )
    .min(1)
    .max(10)
    .describe('Evidence-based explanation for the score.'),
});

export const PatchSuggestionResultSchema = z.strictObject({
  summary: z
    .string()
    .min(10)
    .max(1_000)
    .describe('Short patch strategy summary.'),
  patch: z.string().min(10).max(60_000).describe('Unified diff patch text.'),
  validationChecklist: z
    .array(
      z
        .string()
        .min(6)
        .max(300)
        .describe('Validation step after applying patch.')
    )
    .min(1)
    .max(12)
    .describe('Post-change validation actions.'),
});
