import { z } from 'zod';

const INPUT_LIMITS = {
  repository: { min: 1, max: 200 },
  language: { min: 2, max: 32 },
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

const RepositorySchema = createRepositorySchema();
const LanguageSchema = createLanguageSchema();

export const AnalyzePrImpactInputSchema = z.strictObject({
  repository: RepositorySchema,
  language: LanguageSchema,
});

export const GenerateReviewSummaryInputSchema = z.strictObject({
  repository: RepositorySchema,
  language: LanguageSchema,
});

export const GenerateTestPlanInputSchema = z.strictObject({
  repository: RepositorySchema,
  language: LanguageSchema,
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
  language: LanguageSchema,
});

export const DetectApiBreakingInputSchema = z.strictObject({
  language: LanguageSchema,
});
