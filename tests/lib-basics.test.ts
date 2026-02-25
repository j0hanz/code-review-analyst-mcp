import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCachedEnvInt } from '../src/lib/env-config.js';
import {
  getErrorMessage,
  RETRYABLE_UPSTREAM_ERROR_PATTERN,
} from '../src/lib/errors.js';
import {
  formatCountLabel,
  formatLanguageSegment,
  formatOptionalLine,
} from '../src/lib/format.js';
import { toBulletedList, toInlineCode } from '../src/lib/markdown.js';
import {
  createErrorToolResponse,
  createToolResponse,
} from '../src/lib/tool-response.js';

describe('errors', () => {
  it('extracts message from Error instances and strings', () => {
    assert.equal(getErrorMessage(new Error('boom')), 'boom');
    assert.equal(getErrorMessage('plain'), 'plain');
  });

  it('falls back to inspected representation for unknown values', () => {
    const message = getErrorMessage({ code: 42, nested: { ok: true } });
    assert.match(message, /code/);
    assert.match(message, /nested/);
  });

  it('matches common retryable upstream failures', () => {
    assert.equal(
      RETRYABLE_UPSTREAM_ERROR_PATTERN.test('429 rate limit exceeded'),
      true
    );
    assert.equal(
      RETRYABLE_UPSTREAM_ERROR_PATTERN.test('upstream invalid.json payload'),
      true
    );
    assert.equal(
      RETRYABLE_UPSTREAM_ERROR_PATTERN.test('user input validation failed'),
      false
    );
  });
});

describe('env-config', () => {
  it('reads positive integer env values and caches until reset', () => {
    const previous = process.env.TEST_CACHED_ENV_INT;
    process.env.TEST_CACHED_ENV_INT = '10';

    try {
      const cached = createCachedEnvInt('TEST_CACHED_ENV_INT', 5);
      assert.equal(cached.get(), 10);

      process.env.TEST_CACHED_ENV_INT = '20';
      assert.equal(cached.get(), 10);

      cached.reset();
      assert.equal(cached.get(), 20);
    } finally {
      if (previous === undefined) {
        delete process.env.TEST_CACHED_ENV_INT;
      } else {
        process.env.TEST_CACHED_ENV_INT = previous;
      }
    }
  });

  it('falls back to defaults for invalid values', () => {
    const previous = process.env.TEST_CACHED_ENV_INVALID;
    process.env.TEST_CACHED_ENV_INVALID = '  -1  ';

    try {
      const cached = createCachedEnvInt('TEST_CACHED_ENV_INVALID', 7);
      assert.equal(cached.get(), 7);
    } finally {
      if (previous === undefined) {
        delete process.env.TEST_CACHED_ENV_INVALID;
      } else {
        process.env.TEST_CACHED_ENV_INVALID = previous;
      }
    }
  });
});

describe('format + markdown helpers', () => {
  it('formats optional lines and labels', () => {
    assert.equal(formatOptionalLine('Language', undefined), '');
    assert.equal(
      formatOptionalLine('Language', 'TypeScript'),
      '\nLanguage: TypeScript'
    );
    assert.equal(formatLanguageSegment('Go'), '\nLanguage: Go');
    assert.equal(formatCountLabel(1, 'file', 'files'), '1 file');
    assert.equal(formatCountLabel(2, 'file', 'files'), '2 files');
  });

  it('renders markdown bullet lists and inline code', () => {
    assert.equal(toBulletedList(['a', 'b']), '- a\n- b');
    assert.equal(toInlineCode('x+y'), '`x+y`');
  });
});

describe('tool-response', () => {
  it('creates a structured success response with mirrored text payload', () => {
    const structured = { ok: true, result: { count: 3 } };
    const response = createToolResponse(structured);

    assert.deepEqual(response.structuredContent, structured);
    assert.equal(response.content[0]?.type, 'text');
    assert.deepEqual(JSON.parse(response.content[0]?.text ?? '{}'), structured);
  });

  it('allows custom text content for success responses', () => {
    const structured = { ok: true, result: { count: 1 } };
    const response = createToolResponse(structured, 'custom');
    assert.equal(response.content[0]?.text, 'custom');
  });

  it('creates error response payload with metadata and isError flag', () => {
    const response = createErrorToolResponse(
      'E_BAD',
      'failed',
      { reason: 'unit' },
      { retryable: true, kind: 'internal' }
    );

    assert.equal(response.isError, true);
    const parsed = JSON.parse(response.content[0]?.text ?? '{}') as {
      ok: boolean;
      error?: {
        code: string;
        message: string;
        retryable?: boolean;
        kind?: string;
      };
      result?: { reason: string };
    };

    assert.equal(parsed.ok, false);
    assert.equal(parsed.error?.code, 'E_BAD');
    assert.equal(parsed.error?.message, 'failed');
    assert.equal(parsed.error?.retryable, true);
    assert.equal(parsed.error?.kind, 'internal');
    assert.deepEqual(parsed.result, { reason: 'unit' });
  });
});
