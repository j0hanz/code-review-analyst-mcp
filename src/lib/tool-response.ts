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
  const structured: ToolStructuredContent = {
    ok: false,
    error: { code, message },
    ...(result === undefined ? {} : { result }),
  };

  return {
    content: toTextContent(structured),
    structuredContent: structured,
    isError: true,
  };
}
