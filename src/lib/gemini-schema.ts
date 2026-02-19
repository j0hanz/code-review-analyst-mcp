/**
 * JSON Schema property keys that represent value-range or count constraints.
 * These are stripped when generating relaxed schemas for Gemini structured
 * output so the model is not over-constrained by bounds that the
 * application-level result schema enforces after parsing.
 */
const CONSTRAINT_KEYS = new Set([
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'multipleOf',
]);
type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripConstraintValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) =>
      isJsonRecord(item) ? stripJsonSchemaConstraints(item) : item
    );
  }

  if (isJsonRecord(value)) {
    return stripJsonSchemaConstraints(value);
  }

  return value;
}

/**
 * Recursively strips value-range constraints (`min*`, `max*`, `multipleOf`)
 * from a JSON Schema object and converts `"type": "integer"` to
 * `"type": "number"`.
 *
 * Use this to derive a relaxed schema for Gemini structured output from the
 * same Zod schema that validates tool results. The tool-level result schema
 * enforces strict bounds *after* Gemini returns its response.
 */
export function stripJsonSchemaConstraints(schema: JsonRecord): JsonRecord {
  const result: JsonRecord = {};

  for (const [key, value] of Object.entries(schema)) {
    if (CONSTRAINT_KEYS.has(key)) continue;

    // Relax integer → number so Gemini is not forced into integer-only
    // output; the stricter result schema still validates integrality.
    if (key === 'type' && value === 'integer') {
      result[key] = 'number';
      continue;
    }

    result[key] = stripConstraintValue(value);
  }

  return result;
}
