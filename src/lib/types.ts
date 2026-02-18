export type JsonObject = Record<string, unknown>;

export interface GeminiStructuredRequestOptions {
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  onLog?: (level: string, data: unknown) => Promise<void>;
}

export interface GeminiStructuredRequest extends GeminiStructuredRequestOptions {
  systemInstruction?: string;
  prompt: string;
  responseSchema: JsonObject;
}
