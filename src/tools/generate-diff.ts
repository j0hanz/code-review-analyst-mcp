import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { spawnSync } from 'node:child_process';

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
import {
  createErrorToolResponse,
  createToolResponse,
} from '../lib/tool-response.js';

const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB

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
      description:
        'Generate a diff of the current branch working changes and cache it for all review tools. You MUST call this tool before calling any other review tool. Use "unstaged" for working-tree changes not yet staged, or "staged" for changes already added with git add.',
      inputSchema: {
        mode: z
          .enum(['unstaged', 'staged'])
          .describe(
            '"unstaged": working-tree changes not yet staged. "staged": changes added to the index with git add.'
          ),
      },
    },
    (input) => {
      const { mode } = input;
      const args = buildGitArgs(mode);

      // spawnSync with an explicit args array — no shell, no interpolation.
      // 'git' is resolved via PATH which is controlled by the server environment.
      // eslint-disable-next-line sonarjs/no-os-command-from-path
      const result = spawnSync('git', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: GIT_MAX_BUFFER,
        timeout: GIT_TIMEOUT_MS,
      });

      if (result.error) {
        return createErrorToolResponse(
          'E_GENERATE_DIFF',
          `Failed to run git: ${result.error.message}. Ensure git is installed and the working directory is a git repository.`,
          undefined,
          { retryable: false, kind: 'internal' }
        );
      }

      if (result.status !== 0) {
        const stderr = result.stderr.trim();
        return createErrorToolResponse(
          'E_GENERATE_DIFF',
          `git exited with code ${String(result.status)}: ${stderr || 'unknown error'}. Ensure the working directory is a git repository.`,
          undefined,
          { retryable: false, kind: 'internal' }
        );
      }

      const cleaned = cleanDiff(result.stdout);

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

      storeDiff({ diff: cleaned, stats, generatedAt, mode });

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
    }
  );
}
