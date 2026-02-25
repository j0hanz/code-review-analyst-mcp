export type JsonObject = Record<string, unknown>;
export type GeminiLogHandler = (level: string, data: unknown) => Promise<void>;
export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface GeminiRequestExecutionOptions {
  maxRetries?: number;
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: GeminiThinkingLevel;
  includeThoughts?: boolean;
  signal?: AbortSignal;
  onLog?: GeminiLogHandler;
  responseKeyOrdering?: readonly string[];
  batchMode?: 'off' | 'inline';
}

export interface GeminiStructuredRequestOptions extends GeminiRequestExecutionOptions {
  model?: string;
}

export interface GeminiStructuredRequest extends GeminiStructuredRequestOptions {
  systemInstruction?: string;
  prompt: string;
  responseSchema: Readonly<JsonObject>;
}
