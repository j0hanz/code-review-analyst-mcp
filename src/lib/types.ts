export type JsonObject = Record<string, unknown>;
export type GeminiLogHandler = (level: string, data: unknown) => Promise<void>;

export interface GeminiStructuredRequestOptions {
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
  signal?: AbortSignal;
  onLog?: GeminiLogHandler;
}

export interface GeminiStructuredRequest extends GeminiStructuredRequestOptions {
  systemInstruction?: string;
  prompt: string;
  responseSchema: JsonObject;
}
