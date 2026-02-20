export type JsonObject = Record<string, unknown>;
export type GeminiLogHandler = (level: string, data: unknown) => Promise<void>;

interface GeminiRequestExecutionOptions {
  maxRetries?: number;
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
  signal?: AbortSignal;
  onLog?: GeminiLogHandler;
}

export interface GeminiStructuredRequestOptions extends GeminiRequestExecutionOptions {
  model?: string;
}

export interface GeminiStructuredRequest extends GeminiStructuredRequestOptions {
  systemInstruction?: string;
  prompt: string;
  responseSchema: Readonly<JsonObject>;
}
