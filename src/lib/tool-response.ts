export type ErrorKind =
  | 'validation'
  | 'budget'
  | 'upstream'
  | 'timeout'
  | 'cancelled'
  | 'internal';

export interface ErrorMeta {
  retryable?: boolean;
  kind?: ErrorKind;
}

interface ToolError {
  code: string;
  message: string;
  retryable?: boolean;
  kind?: ErrorKind;
}

interface ToolTextContent {
  type: 'text';
  text: string;
}

interface ToolStructuredContent {
  [key: string]: unknown;
  ok: boolean;
  result?: unknown;
  error?: ToolError;
}

interface ToolResponse<TStructuredContent extends ToolStructuredContent> {
  [key: string]: unknown;
  content: ToolTextContent[];
  structuredContent: TStructuredContent;
}

interface ErrorToolResponse extends ToolResponse<ToolStructuredContent> {
  isError: true;
}

function toTextContent(
  structured: ToolStructuredContent,
  textContent?: string
): ToolTextContent[] {
  if (textContent) {
    return [{ type: 'text', text: textContent }];
  }
  return [{ type: 'text', text: JSON.stringify(structured) }];
}

function createErrorStructuredContent(
  code: string,
  message: string,
  result?: unknown,
  meta?: ErrorMeta
): ToolStructuredContent {
  const error: ToolError = {
    code,
    message,
    ...(meta?.retryable !== undefined
      ? { retryable: meta.retryable }
      : undefined),
    ...(meta?.kind !== undefined ? { kind: meta.kind } : undefined),
  };

  if (result === undefined) {
    return { ok: false, error };
  }

  return { ok: false, error, result };
}

export function createToolResponse<
  TStructuredContent extends ToolStructuredContent,
>(
  structured: TStructuredContent,
  textContent?: string
): ToolResponse<TStructuredContent> {
  return {
    content: toTextContent(structured, textContent),
    structuredContent: structured,
  };
}

export function createErrorToolResponse(
  code: string,
  message: string,
  result?: unknown,
  meta?: ErrorMeta
): ErrorToolResponse {
  const structured = createErrorStructuredContent(code, message, result, meta);

  return {
    content: toTextContent(structured),
    structuredContent: structured,
    isError: true,
  };
}
