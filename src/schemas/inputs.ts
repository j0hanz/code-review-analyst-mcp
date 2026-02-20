import { z } from 'zod';

const INPUT_LIMITS = {
  diff: { min: 10 },
  repository: { min: 1, max: 200 },
  language: { min: 2, max: 32 },
  fileContext: {
    path: { min: 1, max: 500 },
    content: { min: 0, max: 100_000 },
    maxItems: 20,
  },
  focusArea: { min: 2, max: 80, maxItems: 12 },
  maxFindings: { min: 1, max: 25 },
  findingTitle: { min: 3, max: 160 },
  findingDetails: { min: 10, max: 3_000 },
  testFramework: { min: 1, max: 50 },
  maxTestCases: { min: 1, max: 30 },
} as const;

function createBoundedString(
  min: number,
  max: number,
  description: string
): z.ZodString {
  return z.string().min(min).max(max).describe(description);
}

function createOptionalBoundedString(
  min: number,
  max: number,
  description: string
): z.ZodOptional<z.ZodString> {
  return createBoundedString(min, max, description).optional();
}

function createLanguageSchema(description: string): z.ZodOptional<z.ZodString> {
  return createOptionalBoundedString(
    INPUT_LIMITS.language.min,
    INPUT_LIMITS.language.max,
    description
  );
}

function createDiffSchema(description: string): z.ZodString {
  return z
    .string()
    .min(INPUT_LIMITS.diff.min)
    .describe(
      `${description} Budget is enforced at runtime via MAX_DIFF_CHARS (default 120,000 chars).`
    );
}

export const FileContextSchema = z.strictObject({
  path: createBoundedString(
    INPUT_LIMITS.fileContext.path.min,
    INPUT_LIMITS.fileContext.path.max,
    'File path relative to repo root.'
  ),
  content: createBoundedString(
    INPUT_LIMITS.fileContext.content.min,
    INPUT_LIMITS.fileContext.content.max,
    'Full file content.'
  ),
});

export const AnalyzePrImpactInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff text for the PR or commit.'),
  repository: createBoundedString(
    INPUT_LIMITS.repository.min,
    INPUT_LIMITS.repository.max,
    'Repository identifier, e.g. org/repo.'
  ),
  language: createLanguageSchema('Primary language to bias analysis.'),
});

export const GenerateReviewSummaryInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff text for one PR or commit.'),
  repository: createBoundedString(
    INPUT_LIMITS.repository.min,
    INPUT_LIMITS.repository.max,
    'Repository identifier, e.g. org/repo.'
  ),
  language: createLanguageSchema('Primary implementation language.'),
});

export const InspectCodeQualityInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff text for in-depth analysis.'),
  repository: createBoundedString(
    INPUT_LIMITS.repository.min,
    INPUT_LIMITS.repository.max,
    'Repository identifier, e.g. org/repo.'
  ),
  language: createLanguageSchema('Primary language.'),
  focusAreas: z
    .array(
      createBoundedString(
        INPUT_LIMITS.focusArea.min,
        INPUT_LIMITS.focusArea.max,
        'Focus area tag value.'
      )
    )
    .min(1)
    .max(INPUT_LIMITS.focusArea.maxItems)
    .optional()
    .describe('Specific areas to inspect: security, correctness, etc.'),
  maxFindings: z
    .number()
    .int()
    .min(INPUT_LIMITS.maxFindings.min)
    .max(INPUT_LIMITS.maxFindings.max)
    .optional()
    .describe('Maximum number of findings to return.'),
  files: z
    .array(FileContextSchema)
    .min(1)
    .max(INPUT_LIMITS.fileContext.maxItems)
    .optional()
    .describe(
      'Full file contents for context-aware analysis. Provide the files changed in the diff for best results.'
    ),
});

export const SuggestSearchReplaceInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff that contains the issue to fix.'),
  findingTitle: createBoundedString(
    INPUT_LIMITS.findingTitle.min,
    INPUT_LIMITS.findingTitle.max,
    'Short title of the finding to fix.'
  ),
  findingDetails: createBoundedString(
    INPUT_LIMITS.findingDetails.min,
    INPUT_LIMITS.findingDetails.max,
    'Detailed explanation of the bug or risk.'
  ),
});

export const GenerateTestPlanInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff to generate tests for.'),
  repository: createBoundedString(
    INPUT_LIMITS.repository.min,
    INPUT_LIMITS.repository.max,
    'Repository identifier, e.g. org/repo.'
  ),
  language: createLanguageSchema('Primary language.'),
  testFramework: createOptionalBoundedString(
    INPUT_LIMITS.testFramework.min,
    INPUT_LIMITS.testFramework.max,
    'Test framework to use, e.g. jest, vitest, pytest, node:test.'
  ),
  maxTestCases: z
    .number()
    .int()
    .min(INPUT_LIMITS.maxTestCases.min)
    .max(INPUT_LIMITS.maxTestCases.max)
    .optional()
    .describe('Maximum number of test cases to return.'),
});
