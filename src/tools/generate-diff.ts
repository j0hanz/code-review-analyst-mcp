import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

import {
  cleanDiff,
  isEmptyDiff,
  NOISY_EXCLUDE_PATHSPECS,
} from '../lib/diff-cleaner.js';
import {
  computeDiffStatsFromFiles,
  parseDiffFiles,
} from '../lib/diff-parser.js';
import { DIFF_RESOURCE_URI, storeDiff } from '../lib/diff-store.js';
import { wrapToolHandler } from '../lib/tool-factory.js';
import {
  createErrorToolResponse,
  createToolResponse,
} from '../lib/tool-response.js';

const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB

const execFileAsync = promisify(execFile);

type DiffMode = 'unstaged' | 'staged';

function buildGitArgs(mode: DiffMode): string[] {
  const args = ['diff', '--no-color', '--no-ext-diff'];

  if (mode === 'staged') {
    args.push('--cached');
  }

  // '--' separates flags from pathspecs. Everything after it is a
  // pathspec, never interpreted as a flag — prevents flag injection.
  args.push('--', ...NOISY_EXCLUDE_PATHSPECS);

  return args;
}

function describeModeHint(mode: DiffMode): string {
  return mode === 'staged'
    ? 'staged with git add'
    : 'modified but not yet staged (git add)';
}

export function registerGenerateDiffTool(server: McpServer): void {
  server.registerTool(
    'generate_diff',
    {
      title: 'Generate Diff',
      description:
        'Generate a diff of the current branch working changes and cache it for all review tools. You MUST call this tool before calling any other review tool. Use "unstaged" for working-tree changes not yet staged, or "staged" for changes already added with git add.',
      inputSchema: {
        mode: z
          .enum(['unstaged', 'staged'])
          .describe(
            '"unstaged": working-tree changes not yet staged. "staged": changes added to the index with git add.'
          ),
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
    },
    wrapToolHandler(
      {
        toolName: 'generate_diff',
        progressContext: (input) => input.mode,
      },
      async (input) => {
        const { mode } = input;
        const args = buildGitArgs(mode);

        try {
          // execFileAsync with an explicit args array — no shell, no interpolation.
          // 'git' is resolved via PATH which is controlled by the server environment.
          const { stdout } = await execFileAsync('git', args, {
            cwd: process.cwd(),
            encoding: 'utf8',
            maxBuffer: GIT_MAX_BUFFER,
            timeout: GIT_TIMEOUT_MS,
          });

          const cleaned = cleanDiff(stdout);

          if (isEmptyDiff(cleaned)) {
            return createErrorToolResponse(
              'E_NO_CHANGES',
              `No ${mode} changes found in the current branch. Make sure you have changes that are ${describeModeHint(mode)}.`,
              undefined,
              { retryable: false, kind: 'validation' }
            );
          }

          const parsedFiles = parseDiffFiles(cleaned);
          const stats = computeDiffStatsFromFiles(parsedFiles);
          const generatedAt = new Date().toISOString();

          storeDiff({ diff: cleaned, parsedFiles, stats, generatedAt, mode });

          const summary = `Diff cached at ${DIFF_RESOURCE_URI} — ${stats.files} file(s), +${stats.added} -${stats.deleted}. All review tools are now ready.`;

          return createToolResponse(
            {
              ok: true as const,
              result: {
                diffRef: DIFF_RESOURCE_URI,
                stats,
                generatedAt,
                mode,
                message: summary,
              },
            },
            summary
          );
        } catch (error: unknown) {
          const err = error as Error & {
            code?: number | string;
            stderr?: string;
          };

          if (err.code && typeof err.code === 'number') {
            const stderr = err.stderr ? err.stderr.trim() : '';
            return createErrorToolResponse(
              'E_GENERATE_DIFF',
              `git exited with code ${String(err.code)}: ${stderr || 'unknown error'}. Ensure the working directory is a git repository.`,
              undefined,
              { retryable: false, kind: 'internal' }
            );
          }

          return createErrorToolResponse(
            'E_GENERATE_DIFF',
            `Failed to run git: ${err.message}. Ensure git is installed and the working directory is a git repository.`,
            undefined,
            { retryable: false, kind: 'internal' }
          );
        }
      }
    )
  );
}
