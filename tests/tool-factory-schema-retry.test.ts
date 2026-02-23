import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarizeSchemaValidationErrorForRetry } from '../src/lib/tool-factory.js';

test('summarizeSchemaValidationErrorForRetry compacts and truncates long errors', () => {
  const longError = `Validation failed: ${'x'.repeat(5_000)}`;
  const summarized = summarizeSchemaValidationErrorForRetry(longError);

  assert.ok(summarized.length < longError.length);
  assert.ok(summarized.endsWith('...'));
});

test('summarizeSchemaValidationErrorForRetry preserves short errors', () => {
  const shortError = 'Validation failed for required field: severity';
  const summarized = summarizeSchemaValidationErrorForRetry(shortError);

  assert.equal(summarized, shortError);
});

test('summarizeSchemaValidationErrorForRetry compacts repeated whitespace', () => {
  const noisyError = 'Validation\n\nfailed\tfor    field: severity';
  const summarized = summarizeSchemaValidationErrorForRetry(noisyError);

  assert.equal(summarized, 'Validation failed for field: severity');
});
