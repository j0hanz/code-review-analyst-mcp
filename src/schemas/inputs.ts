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

function createBoundedString(
  min: number,
  max: number,
  description: string
): z.ZodString {
  return z.string().min(min).max(max).describe(description);
}

function createDiffSchema(description: string): z.ZodString {
  return createBoundedString(
    INPUT_LIMITS.diff.min,
    INPUT_LIMITS.diff.max,
    description
  );
}

export const ReviewDiffInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff text for one PR or commit.'),
  repository: createBoundedString(
    INPUT_LIMITS.repository.min,
    INPUT_LIMITS.repository.max,
    'Repository identifier, for example org/repo.'
  ),
  language: createBoundedString(
    INPUT_LIMITS.language.min,
    INPUT_LIMITS.language.max,
    'Primary implementation language to bias review depth.'
  ).optional(),
  focusAreas: z
    .array(
      createBoundedString(
        INPUT_LIMITS.focusArea.min,
        INPUT_LIMITS.focusArea.max,
        'Specific area to inspect, for example security or tests.'
      )
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
  findingTitle: createBoundedString(
    INPUT_LIMITS.findingTitle.min,
    INPUT_LIMITS.findingTitle.max,
    'Short title of the finding that needs a patch.'
  ),
  findingDetails: createBoundedString(
    INPUT_LIMITS.findingDetails.min,
    INPUT_LIMITS.findingDetails.max,
    'Detailed explanation of the bug or risk.'
  ),
  patchStyle: z
    .enum(['minimal', 'balanced', 'defensive'])
    .optional()
    .describe('How broad the patch should be.'),
});
