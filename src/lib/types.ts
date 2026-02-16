export type JsonObject = Record<string, unknown>;

interface GeminiStructuredRequestOptions {
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
  temperature?: number;
}

export interface GeminiStructuredRequest extends GeminiStructuredRequestOptions {
  systemInstruction?: string;
  prompt: string;
  responseSchema: JsonObject;
}
