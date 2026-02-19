import assert from 'node:assert/strict';
import { test } from 'node:test';

import { z } from 'zod';

import { stripJsonSchemaConstraints } from '../src/lib/gemini-schema.js';
import {
  PrImpactResultSchema,
  ReviewSummaryResultSchema,
  SearchReplaceResultSchema,
} from '../src/schemas/outputs.js';

// --- Unit tests for stripJsonSchemaConstraints ---

test('strips minLength and maxLength from string schemas', () => {
  const input = { type: 'string', minLength: 5, maxLength: 200 };
  const result = stripJsonSchemaConstraints(input);

  assert.deepEqual(result, { type: 'string' });
});

test('strips minimum and maximum from number schemas', () => {
  const input = { type: 'number', minimum: 0, maximum: 100 };
  const result = stripJsonSchemaConstraints(input);

  assert.deepEqual(result, { type: 'number' });
});

test('converts integer type to number', () => {
  const input = { type: 'integer', minimum: 1, maximum: 1000000 };
  const result = stripJsonSchemaConstraints(input);

  assert.deepEqual(result, { type: 'number' });
});

test('strips minItems and maxItems from array schemas', () => {
  const input = {
    type: 'array',
    items: { type: 'string', minLength: 5 },
    minItems: 1,
    maxItems: 12,
  };
  const result = stripJsonSchemaConstraints(input);

  assert.deepEqual(result, {
    type: 'array',
    items: { type: 'string' },
  });
});

test('strips multipleOf constraint', () => {
  const input = { type: 'number', multipleOf: 1 };
  const result = stripJsonSchemaConstraints(input);

  assert.deepEqual(result, { type: 'number' });
});

test('strips exclusiveMinimum and exclusiveMaximum', () => {
  const input = { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 100 };
  const result = stripJsonSchemaConstraints(input);

  assert.deepEqual(result, { type: 'number' });
});

test('recursively strips constraints from nested properties', () => {
  const input = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      score: { type: 'integer', minimum: 0, maximum: 100 },
    },
    required: ['name', 'score'],
  };
  const result = stripJsonSchemaConstraints(input);

  assert.deepEqual(result, {
    type: 'object',
    properties: {
      name: { type: 'string' },
      score: { type: 'number' },
    },
    required: ['name', 'score'],
  });
});

test('recursively strips constraints inside anyOf (nullable types)', () => {
  const input = {
    anyOf: [
      { type: 'integer', minimum: 1, maximum: 1000000 },
      { type: 'null' },
    ],
  };
  const result = stripJsonSchemaConstraints(input);

  assert.deepEqual(result, {
    anyOf: [{ type: 'number' }, { type: 'null' }],
  });
});

test('preserves enum values unchanged', () => {
  const input = {
    type: 'string',
    enum: ['low', 'medium', 'high', 'critical'],
  };
  const result = stripJsonSchemaConstraints(input);

  assert.deepEqual(result, input);
});

test('preserves description and other metadata', () => {
  const input = {
    type: 'string',
    description: 'File path for the finding.',
    minLength: 1,
    maxLength: 260,
  };
  const result = stripJsonSchemaConstraints(input);

  assert.deepEqual(result, {
    type: 'string',
    description: 'File path for the finding.',
  });
});

test('returns empty object for empty input', () => {
  assert.deepEqual(stripJsonSchemaConstraints({}), {});
});

// --- Integration tests: verify result schemas produce valid relaxed JSON Schema ---

test('ReviewSummaryResultSchema produces valid relaxed JSON Schema', () => {
  const jsonSchema = z.toJSONSchema(ReviewSummaryResultSchema);
  const relaxed = stripJsonSchemaConstraints(
    jsonSchema as Record<string, unknown>
  );

  assert.equal(typeof relaxed, 'object');
  assert.ok(relaxed !== null);
  // Should not contain any constraint keys at any level
  const serialized = JSON.stringify(relaxed);
  assert.ok(!serialized.includes('"minLength"'));
  assert.ok(!serialized.includes('"maxLength"'));
  assert.ok(!serialized.includes('"minItems"'));
  assert.ok(!serialized.includes('"maxItems"'));
  assert.ok(!serialized.includes('"minimum"'));
  assert.ok(!serialized.includes('"maximum"'));
  assert.ok(!serialized.includes('"integer"'));
});

test('PrImpactResultSchema produces valid relaxed JSON Schema', () => {
  const jsonSchema = z.toJSONSchema(PrImpactResultSchema);
  const relaxed = stripJsonSchemaConstraints(
    jsonSchema as Record<string, unknown>
  );

  assert.equal(typeof relaxed, 'object');
  const serialized = JSON.stringify(relaxed);
  assert.ok(!serialized.includes('"minimum"'));
  assert.ok(!serialized.includes('"maximum"'));
  assert.ok(!serialized.includes('"integer"'));
});

test('SearchReplaceResultSchema produces valid relaxed JSON Schema', () => {
  const jsonSchema = z.toJSONSchema(SearchReplaceResultSchema);
  const relaxed = stripJsonSchemaConstraints(
    jsonSchema as Record<string, unknown>
  );

  assert.equal(typeof relaxed, 'object');
  const serialized = JSON.stringify(relaxed);
  assert.ok(!serialized.includes('"minLength"'));
  assert.ok(!serialized.includes('"maxLength"'));
  assert.ok(!serialized.includes('"minItems"'));
  assert.ok(!serialized.includes('"maxItems"'));
});
