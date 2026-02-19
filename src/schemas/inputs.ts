import { z } from 'zod';

const INPUT_LIMITS = {
  diff: { min: 10, max: 120_000 },
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
    `${description} Default limit 120,000 chars; override via MAX_DIFF_CHARS env var.`
  );
}

export const FileContextSchema = z.strictObject({
  path: z.string().min(1).max(500).describe('File path relative to repo root.'),
  content: z.string().min(0).max(100_000).describe('Full file content.'),
});

export const AnalyzePrImpactInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff text for the PR or commit.'),
  repository: createBoundedString(
    1,
    200,
    'Repository identifier, e.g. org/repo.'
  ),
  language: z
    .string()
    .min(2)
    .max(32)
    .optional()
    .describe('Primary language to bias analysis.'),
});

export const GenerateReviewSummaryInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff text for one PR or commit.'),
  repository: createBoundedString(
    1,
    200,
    'Repository identifier, e.g. org/repo.'
  ),
  language: z
    .string()
    .min(2)
    .max(32)
    .optional()
    .describe('Primary implementation language.'),
});

export const InspectCodeQualityInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff text for in-depth analysis.'),
  repository: createBoundedString(
    1,
    200,
    'Repository identifier, e.g. org/repo.'
  ),
  language: z.string().min(2).max(32).optional().describe('Primary language.'),
  focusAreas: z
    .array(z.string().min(2).max(80))
    .min(1)
    .max(12)
    .optional()
    .describe('Specific areas to inspect: security, correctness, etc.'),
  maxFindings: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe('Maximum number of findings to return.'),
  files: z
    .array(FileContextSchema)
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Full file contents for context-aware analysis. Provide the files changed in the diff for best results.'
    ),
});

export const SuggestSearchReplaceInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff that contains the issue to fix.'),
  findingTitle: createBoundedString(
    3,
    160,
    'Short title of the finding to fix.'
  ),
  findingDetails: createBoundedString(
    10,
    3000,
    'Detailed explanation of the bug or risk.'
  ),
});

export const GenerateTestPlanInputSchema = z.strictObject({
  diff: createDiffSchema('Unified diff to generate tests for.'),
  repository: createBoundedString(
    1,
    200,
    'Repository identifier, e.g. org/repo.'
  ),
  language: z.string().min(2).max(32).optional().describe('Primary language.'),
  testFramework: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe('Test framework to use, e.g. jest, vitest, pytest, node:test.'),
  maxTestCases: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .describe('Maximum number of test cases to return.'),
});
