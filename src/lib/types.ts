export type JsonObject = Record<string, unknown>;

interface GeminiStructuredRequestOptions {
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
  temperature?: number;
}

export interface GeminiStructuredRequest extends GeminiStructuredRequestOptions {
  prompt: string;
  responseSchema: JsonObject;
}
