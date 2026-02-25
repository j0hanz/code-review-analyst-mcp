import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ParsedFile } from './diff.js';
import { createCachedEnvInt } from './env-config.js';
import { createErrorToolResponse } from './tool-response.js';

export const DIFF_RESOURCE_URI = 'diff://current';

const diffCacheTtlMs = createCachedEnvInt(
  'DIFF_CACHE_TTL_MS',
  60 * 60 * 1_000 // 1 hour default
);

export const diffStaleWarningMs = createCachedEnvInt(
  'DIFF_STALE_WARNING_MS',
  5 * 60 * 1_000 // 5 minutes default
);

export interface DiffStats {
  files: number;
  added: number;
  deleted: number;
}

export interface DiffSlot {
  diff: string;
  parsedFiles: readonly ParsedFile[];
  stats: DiffStats;
  generatedAt: string;
  mode: string;
}

type SendResourceUpdated = (params: { uri: string }) => Promise<void>;

const diffSlots = new Map<string, DiffSlot>();
let sendResourceUpdated: SendResourceUpdated | undefined;

function setDiffSlot(key: string, data: DiffSlot | undefined): void {
  if (data) {
    diffSlots.set(key, data);
  } else {
    diffSlots.delete(key);
  }
}

function notifyDiffUpdated(): void {
  void sendResourceUpdated?.({ uri: DIFF_RESOURCE_URI }).catch(() => {
    // Ignore errors sending resource-updated, which can happen if the server is not fully initialized yet.
  });
}

/** Call once during server setup so the store can emit resource-updated notifications. */
export function initDiffStore(server: McpServer): void {
  const inner = (
    server as unknown as {
      server?: { sendResourceUpdated?: SendResourceUpdated };
    }
  ).server;
  if (typeof inner?.sendResourceUpdated === 'function') {
    sendResourceUpdated = inner.sendResourceUpdated.bind(inner);
  } else {
    console.error(
      '[diff-store] sendResourceUpdated not available — diff resource notifications disabled.'
    );
  }
}

export function storeDiff(data: DiffSlot, key: string = process.cwd()): void {
  setDiffSlot(key, data);
  notifyDiffUpdated();
}

export function getDiff(key: string = process.cwd()): DiffSlot | undefined {
  const slot = diffSlots.get(key);
  if (!slot) {
    return undefined;
  }

  const age = Date.now() - new Date(slot.generatedAt).getTime();
  if (age > diffCacheTtlMs.get()) {
    diffSlots.delete(key);
    notifyDiffUpdated();
    return undefined;
  }

  return slot;
}

export function hasDiff(key: string = process.cwd()): boolean {
  return diffSlots.has(key);
}

/** Test-only: directly set or clear the diff slot without emitting resource-updated. */
export function setDiffForTesting(
  data: DiffSlot | undefined,
  key: string = process.cwd()
): void {
  setDiffSlot(key, data);
}

export function createNoDiffError(): ReturnType<
  typeof createErrorToolResponse
> {
  return createErrorToolResponse(
    'E_NO_DIFF',
    'No diff cached. You must call the generate_diff tool before using any review tool. Run generate_diff with mode="unstaged" or mode="staged" to capture the current branch changes, then retry this tool.',
    undefined,
    { retryable: false, kind: 'validation' }
  );
}
