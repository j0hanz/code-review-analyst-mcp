import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { generateGroundedContent } from '../lib/gemini.js';
import { WebSearchInputSchema } from '../schemas/inputs.js';

interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GroundingSupport {
  segment?: {
    text?: string;
    startIndex?: number;
    endIndex?: number;
  };
  groundingChunkIndices?: number[];
}

interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
  searchEntryPoint?: unknown;
}

function formatGroundedResponse(
  text: string,
  metadata: GroundingMetadata | undefined
): string {
  if (!metadata?.groundingSupports || !metadata.groundingChunks) {
    return text;
  }

  const supports = metadata.groundingSupports;
  const chunks = metadata.groundingChunks;
  let formattedText = text;

  // Sort supports by end_index in descending order to avoid shifting issues when inserting.
  const sortedSupports = [...supports].sort(
    (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0)
  );

  for (const support of sortedSupports) {
    const endIndex = support.segment?.endIndex;
    if (endIndex === undefined || !support.groundingChunkIndices?.length) {
      continue;
    }

    const citationLinks = support.groundingChunkIndices
      .map((i) => {
        const chunk = chunks[i];
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title ?? 'Source';
        if (uri) {
          return `[${title}](${uri})`;
        }
        return null;
      })
      .filter(Boolean);

    if (citationLinks.length > 0) {
      const citationString = ` ${citationLinks.join(' ')}`;
      formattedText =
        formattedText.slice(0, endIndex) +
        citationString +
        formattedText.slice(endIndex);
    }
  }

  return formattedText;
}

export function registerWebSearchTool(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  server.tool(
    'web_search',
    'Perform a Google Search with Grounding to get up-to-date information.',
    {
      query: WebSearchInputSchema.shape.query,
    },
    async ({ query }) => {
      try {
        const result = await generateGroundedContent({
          prompt: query,
          responseSchema: {}, // Ignored but required by type
        });

        const { text } = result;
        const metadata = result.groundingMetadata as GroundingMetadata;
        const formatted = formatGroundedResponse(text, metadata);

        return {
          content: [
            {
              type: 'text',
              text: formatted,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
