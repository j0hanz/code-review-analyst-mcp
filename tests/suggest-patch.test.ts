import assert from 'node:assert/strict';
import { test } from 'node:test';

import { zodToJsonSchema } from 'zod-to-json-schema';

import { SuggestPatchInputSchema } from '../src/schemas/inputs.js';
import {
  PatchSuggestionGeminiSchema,
  PatchSuggestionResultSchema,
} from '../src/schemas/outputs.js';

test('SuggestPatchInputSchema rejects unknown fields', () => {
  const parsed = SuggestPatchInputSchema.safeParse({
    diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
    findingTitle: 'Missing null check',
    findingDetails:
      'The function does not check for null return values which can cause runtime crashes.',
    extraField: 'not allowed',
  });

  assert.equal(parsed.success, false);
});

test('SuggestPatchInputSchema accepts valid input with patchStyle', () => {
  const parsed = SuggestPatchInputSchema.safeParse({
    diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
    findingTitle: 'Missing null check',
    findingDetails:
      'The function does not check for null return values which can cause runtime crashes.',
    patchStyle: 'defensive',
  });

  assert.equal(parsed.success, true);
});

test('SuggestPatchInputSchema rejects missing required findingTitle', () => {
  const parsed = SuggestPatchInputSchema.safeParse({
    diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
    findingDetails:
      'The function does not check for null return values which can cause runtime crashes.',
  });

  assert.equal(parsed.success, false);
});

test('PatchSuggestionResultSchema validates expected payload shape', () => {
  const parsed = PatchSuggestionResultSchema.parse({
    summary: 'Added null guard before accessing user property.',
    patch:
      'diff --git a/src/auth.ts b/src/auth.ts\n--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -42,6 +42,9 @@\n+  if (!user) return null;',
    validationChecklist: ['Verify null guard covers all access paths.'],
  });

  assert.equal(parsed.validationChecklist.length, 1);
  assert.ok(parsed.patch.length > 0);
});

test('PatchSuggestionResultSchema rejects empty validationChecklist', () => {
  const parsed = PatchSuggestionResultSchema.safeParse({
    summary: 'Added null guard before accessing user property.',
    patch:
      'diff --git a/src/auth.ts b/src/auth.ts\n--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -42,6 +42,9 @@\n+  if (!user) return null;',
    validationChecklist: [],
  });

  assert.equal(parsed.success, false);
});

test('PatchSuggestionGeminiSchema accepts valid payload without bounds', () => {
  const parsed = PatchSuggestionGeminiSchema.safeParse({
    summary: 'x',
    patch: 'y',
    validationChecklist: ['z'],
  });

  assert.equal(parsed.success, true);
});

test('PatchSuggestionGeminiSchema converts to JSON Schema', () => {
  const jsonSchema = zodToJsonSchema(PatchSuggestionGeminiSchema);

  assert.equal(typeof jsonSchema, 'object');
  assert.ok('properties' in jsonSchema);
});
