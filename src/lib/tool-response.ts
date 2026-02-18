interface ToolError {
  code: string;
  message: string;
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

function toTextContent(structured: ToolStructuredContent): ToolTextContent[] {
  return [{ type: 'text', text: JSON.stringify(structured) }];
}

export function createToolResponse<
  TStructuredContent extends ToolStructuredContent,
>(structured: TStructuredContent): ToolResponse<TStructuredContent> {
  return {
    content: toTextContent(structured),
    structuredContent: structured,
  };
}

export function createErrorToolResponse(
  code: string,
  message: string,
  result?: unknown
): ErrorToolResponse {
  // Avoid allocating an intermediate {} when result is absent (the common case).
  const structured: ToolStructuredContent =
    result !== undefined
      ? { ok: false, error: { code, message }, result }
      : { ok: false, error: { code, message } };

  return {
    content: toTextContent(structured),
    structuredContent: structured,
    isError: true,
  };
}
