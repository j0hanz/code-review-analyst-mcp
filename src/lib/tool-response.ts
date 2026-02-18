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

function createErrorStructuredContent(
  code: string,
  message: string,
  result?: unknown
): ToolStructuredContent {
  if (result === undefined) {
    return { ok: false, error: { code, message } };
  }

  return { ok: false, error: { code, message }, result };
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
  const structured = createErrorStructuredContent(code, message, result);

  return {
    content: toTextContent(structured),
    structuredContent: structured,
    isError: true,
  };
}
