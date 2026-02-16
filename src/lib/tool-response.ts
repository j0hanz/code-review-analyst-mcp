interface BaseResult {
  [key: string]: unknown;
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export function createToolResponse(structured: BaseResult): {
  content: { type: 'text'; text: string }[];
  structuredContent: BaseResult;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

export function createErrorToolResponse(
  code: string,
  message: string,
  result?: unknown
): {
  content: { type: 'text'; text: string }[];
  structuredContent: BaseResult;
  isError: true;
} {
  const structured: BaseResult = {
    ok: false,
    error: { code, message },
  };

  if (result !== undefined) {
    structured.result = result;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError: true,
  };
}
