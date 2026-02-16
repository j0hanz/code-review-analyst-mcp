export type JsonObject = Record<string, unknown>;

export interface GeminiProgressUpdate {
  progress: number;
  total?: number;
  message?: string;
}

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
  onProgress?: (update: GeminiProgressUpdate) => Promise<void> | void;
}
