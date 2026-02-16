export type JsonObject = Record<string, unknown>;

export interface GeminiStructuredRequest {
  model?: string;
  prompt: string;
  responseSchema: JsonObject;
  maxRetries?: number;
  timeoutMs?: number;
  temperature?: number;
}
