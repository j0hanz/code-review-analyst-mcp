import { z } from 'zod';

const INPUT_LIMITS = {
  diff: { min: 10, max: 400_000 },
  repository: { min: 1, max: 200 },
  language: { min: 2, max: 32 },
  focusArea: { min: 2, max: 80, maxItems: 12 },
  maxFindings: { min: 1, max: 25 },
  findingTitle: { min: 3, max: 160 },
  findingDetails: { min: 10, max: 3_000 },
} as const;

function createDiffSchema(description: string): z.ZodString {
  return z
    .string()
    .min(INPUT_LIMITS.diff.min)
    .max(INPUT_LIMITS.diff.max)
    .describe(description);
}

export const ReviewDiffInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff text for one PR or commit.'),
  repository: z
    .string()
    .min(INPUT_LIMITS.repository.min)
    .max(INPUT_LIMITS.repository.max)
    .describe('Repository identifier, for example org/repo.'),
  language: z
    .string()
    .min(INPUT_LIMITS.language.min)
    .max(INPUT_LIMITS.language.max)
    .optional()
    .describe('Primary implementation language to bias review depth.'),
  focusAreas: z
    .array(
      z
        .string()
        .min(INPUT_LIMITS.focusArea.min)
        .max(INPUT_LIMITS.focusArea.max)
        .describe('Specific area to inspect, for example security or tests.')
    )
    .min(1)
    .max(INPUT_LIMITS.focusArea.maxItems)
    .optional()
    .describe('Optional list of priorities for this review pass.'),
  maxFindings: z
    .number()
    .int()
    .min(INPUT_LIMITS.maxFindings.min)
    .max(INPUT_LIMITS.maxFindings.max)
    .optional()
    .describe('Maximum number of findings to return.'),
});

export const RiskScoreInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff text to analyze for release risk.'),
  deploymentCriticality: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('How sensitive the target system is to regressions.'),
});

export const SuggestPatchInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff text that contains the issue to patch.'),
  findingTitle: z
    .string()
    .min(INPUT_LIMITS.findingTitle.min)
    .max(INPUT_LIMITS.findingTitle.max)
    .describe('Short title of the finding that needs a patch.'),
  findingDetails: z
    .string()
    .min(INPUT_LIMITS.findingDetails.min)
    .max(INPUT_LIMITS.findingDetails.max)
    .describe('Detailed explanation of the bug or risk.'),
  patchStyle: z
    .enum(['minimal', 'balanced', 'defensive'])
    .optional()
    .describe('How broad the patch should be.'),
});
