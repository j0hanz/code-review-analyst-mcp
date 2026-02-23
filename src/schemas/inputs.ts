import { z } from 'zod';

const INPUT_LIMITS = {
  repository: { min: 1, max: 200 },
  language: { min: 2, max: 32 },
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

const LANGUAGE_DESCRIPTION =
  'Primary language (e.g. TypeScript). Auto-infer from files.';

const REPOSITORY_DESCRIPTION = 'Repo ID (owner/repo). Auto-infer from git/dir.';

function createLanguageSchema(): z.ZodOptional<z.ZodString> {
  return createOptionalBoundedString(
    INPUT_LIMITS.language.min,
    INPUT_LIMITS.language.max,
    LANGUAGE_DESCRIPTION
  );
}

function createRepositorySchema(): z.ZodString {
  return createBoundedString(
    INPUT_LIMITS.repository.min,
    INPUT_LIMITS.repository.max,
    REPOSITORY_DESCRIPTION
  );
}

function createOptionalBoundedInteger(
  min: number,
  max: number,
  description: string
): z.ZodOptional<z.ZodNumber> {
  return z.number().int().min(min).max(max).optional().describe(description);
}

export const AnalyzePrImpactInputSchema = z.strictObject({
  repository: createRepositorySchema(),
  language: createLanguageSchema(),
});

export const GenerateReviewSummaryInputSchema = z.strictObject({
  repository: createRepositorySchema(),
  language: createLanguageSchema(),
});

export const InspectCodeQualityInputSchema = z.strictObject({
  repository: createRepositorySchema(),
  language: createLanguageSchema(),
  focusAreas: z
    .array(
      createBoundedString(
        INPUT_LIMITS.focusArea.min,
        INPUT_LIMITS.focusArea.max,
        'Focus tag (e.g. security, logic).'
      )
    )
    .min(1)
    .max(INPUT_LIMITS.focusArea.maxItems)
    .optional()
    .describe(
      'Review focus areas. Tags: security, correctness, performance, regressions, tests, maintainability, concurrency.'
    ),
  maxFindings: createOptionalBoundedInteger(
    INPUT_LIMITS.maxFindings.min,
    INPUT_LIMITS.maxFindings.max,
    'Max findings (1-25). Default: 10.'
  ),
});

export const SuggestSearchReplaceInputSchema = z.strictObject({
  findingTitle: createBoundedString(
    INPUT_LIMITS.findingTitle.min,
    INPUT_LIMITS.findingTitle.max,
    'Exact finding title from inspect_code_quality.'
  ),
  findingDetails: createBoundedString(
    INPUT_LIMITS.findingDetails.min,
    INPUT_LIMITS.findingDetails.max,
    'Exact finding explanation from inspect_code_quality.'
  ),
});

export const GenerateTestPlanInputSchema = z.strictObject({
  repository: createRepositorySchema(),
  language: createLanguageSchema(),
  testFramework: createOptionalBoundedString(
    INPUT_LIMITS.testFramework.min,
    INPUT_LIMITS.testFramework.max,
    'Test framework (jest, pytest, etc). Auto-infer.'
  ),
  maxTestCases: createOptionalBoundedInteger(
    INPUT_LIMITS.maxTestCases.min,
    INPUT_LIMITS.maxTestCases.max,
    'Max test cases (1-30). Default: 15.'
  ),
});

export const AnalyzeComplexityInputSchema = z.strictObject({
  language: createLanguageSchema(),
});

export const DetectApiBreakingInputSchema = z.strictObject({
  language: createLanguageSchema(),
});
