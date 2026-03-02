import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  SOURCE_RESOURCE_URI,
  storeFile,
  validateFileBudget,
} from '../lib/file-store.js';
import { wrapToolHandler } from '../lib/tools.js';
import { createErrorToolResponse, createToolResponse } from '../lib/tools.js';
import { LoadFileInputSchema } from '../schemas/inputs.js';
import { DefaultOutputSchema } from '../schemas/outputs.js';

const VALIDATION_META = { retryable: false, kind: 'validation' as const };

const EXTENSION_LANGUAGE_MAP: ReadonlyMap<string, string> = new Map([
  ['.ts', 'TypeScript'],
  ['.tsx', 'TypeScript'],
  ['.js', 'JavaScript'],
  ['.jsx', 'JavaScript'],
  ['.mjs', 'JavaScript'],
  ['.cjs', 'JavaScript'],
  ['.py', 'Python'],
  ['.rb', 'Ruby'],
  ['.go', 'Go'],
  ['.rs', 'Rust'],
  ['.java', 'Java'],
  ['.kt', 'Kotlin'],
  ['.cs', 'C#'],
  ['.c', 'C'],
  ['.cpp', 'C++'],
  ['.h', 'C'],
  ['.hpp', 'C++'],
  ['.swift', 'Swift'],
  ['.php', 'PHP'],
  ['.sh', 'Shell'],
  ['.bash', 'Shell'],
  ['.zsh', 'Shell'],
  ['.json', 'JSON'],
  ['.yaml', 'YAML'],
  ['.yml', 'YAML'],
  ['.toml', 'TOML'],
  ['.xml', 'XML'],
  ['.html', 'HTML'],
  ['.css', 'CSS'],
  ['.scss', 'SCSS'],
  ['.sql', 'SQL'],
  ['.md', 'Markdown'],
  ['.lua', 'Lua'],
  ['.r', 'R'],
  ['.dart', 'Dart'],
  ['.ex', 'Elixir'],
  ['.exs', 'Elixir'],
  ['.erl', 'Erlang'],
  ['.zig', 'Zig'],
  ['.vue', 'Vue'],
  ['.svelte', 'Svelte'],
]);

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_LANGUAGE_MAP.get(ext) ?? 'Unknown';
}

const DENIED_SEGMENTS = new Set(['.env', '.git', 'node_modules']);

function isDeniedPath(resolved: string): boolean {
  return resolved
    .split(path.sep)
    .some((segment) => DENIED_SEGMENTS.has(segment));
}

function validateFilePath(
  filePath: string,
  workspaceRoot: string
): string | undefined {
  const resolved = path.resolve(filePath);
  const resolvedRoot = path.resolve(workspaceRoot);

  const relative = path.relative(resolvedRoot, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return 'File path must be within the workspace root directory.';
  }

  if (isDeniedPath(resolved)) {
    return 'Access to this file path is denied (.env, .git/, node_modules/).';
  }

  return undefined;
}

export function registerLoadFileTool(server: McpServer): void {
  server.registerTool(
    'load_file',
    {
      title: 'Load File',
      description:
        'Read a single file from disk and cache it for file analysis tools. You MUST call this tool before calling any file analysis tool (e.g. refactor_code). Pass the absolute file path. The file must be within the workspace root.',
      inputSchema: z.strictObject({
        filePath: z
          .string()
          .min(1)
          .max(500)
          .describe('Absolute path to the file to analyze.'),
      }),
      outputSchema: DefaultOutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
    },
    wrapToolHandler(
      {
        toolName: 'load_file',
        progressContext: (input) => path.basename(input.filePath),
      },
      async (input) => {
        const parsed = LoadFileInputSchema.parse(input);
        const { filePath } = parsed;

        const pathError = validateFilePath(filePath, process.cwd());
        if (pathError) {
          return createErrorToolResponse(
            'E_LOAD_FILE',
            pathError,
            undefined,
            VALIDATION_META
          );
        }

        const resolved = path.resolve(filePath);

        let fileStat;
        try {
          fileStat = await stat(resolved);
        } catch {
          return createErrorToolResponse(
            'E_LOAD_FILE',
            `File not found or not accessible: ${resolved}`,
            undefined,
            VALIDATION_META
          );
        }

        if (!fileStat.isFile()) {
          return createErrorToolResponse(
            'E_LOAD_FILE',
            'Path is not a regular file.',
            undefined,
            VALIDATION_META
          );
        }

        let content: string;
        try {
          content = await readFile(resolved, 'utf8');
        } catch {
          return createErrorToolResponse(
            'E_LOAD_FILE',
            `Failed to read file: ${resolved}`,
            undefined,
            { retryable: false, kind: 'internal' }
          );
        }

        const budgetError = validateFileBudget(content);
        if (budgetError) {
          return budgetError;
        }

        const language = detectLanguage(resolved);
        const lineCount = content.split('\n').length;
        const sizeChars = content.length;
        const cachedAt = performance.now();

        storeFile({
          filePath: resolved,
          content,
          language,
          lineCount,
          sizeChars,
          cachedAt,
        });

        const summary = `File cached: ${path.basename(resolved)} (${language}, ${lineCount} lines, ${sizeChars} chars)`;
        return createToolResponse(
          {
            ok: true as const,
            result: {
              fileRef: SOURCE_RESOURCE_URI,
              filePath: resolved,
              language,
              lineCount,
              sizeChars,
              cachedAt,
              message: summary,
            },
          },
          summary
        );
      }
    )
  );
}
