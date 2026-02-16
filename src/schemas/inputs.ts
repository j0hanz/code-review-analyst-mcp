import { z } from 'zod';

export const ReviewDiffInputSchema = z.strictObject({
  diff: z
    .string()
    .min(10)
    .max(400_000)
    .describe('Unified diff text for one PR or commit.'),
  repository: z
    .string()
    .min(1)
    .max(200)
    .describe('Repository identifier, for example org/repo.'),
  language: z
    .string()
    .min(2)
    .max(32)
    .optional()
    .describe('Primary implementation language to bias review depth.'),
  focusAreas: z
    .array(
      z
        .string()
        .min(2)
        .max(80)
        .describe('Specific area to inspect, for example security or tests.')
    )
    .min(1)
    .max(12)
    .optional()
    .describe('Optional list of priorities for this review pass.'),
  maxFindings: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe('Maximum number of findings to return.'),
});

export const RiskScoreInputSchema = z.strictObject({
  diff: z
    .string()
    .min(10)
    .max(400_000)
    .describe('Unified diff text to analyze for release risk.'),
  deploymentCriticality: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('How sensitive the target system is to regressions.'),
});

export const SuggestPatchInputSchema = z.strictObject({
  diff: z
    .string()
    .min(10)
    .max(400_000)
    .describe('Unified diff text that contains the issue to patch.'),
  findingTitle: z
    .string()
    .min(3)
    .max(160)
    .describe('Short title of the finding that needs a patch.'),
  findingDetails: z
    .string()
    .min(10)
    .max(3_000)
    .describe('Detailed explanation of the bug or risk.'),
  patchStyle: z
    .enum(['minimal', 'balanced', 'defensive'])
    .optional()
    .describe('How broad the patch should be.'),
});
