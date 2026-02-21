import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createErrorToolResponse } from './tool-response.js';

export const DIFF_RESOURCE_URI = 'diff://current';

export interface DiffStats {
  files: number;
  added: number;
  deleted: number;
}

export interface DiffSlot {
  diff: string;
  stats: DiffStats;
  generatedAt: string;
  mode: string;
}

type SendResourceUpdated = (params: { uri: string }) => Promise<void>;

let slot: DiffSlot | undefined;
let sendResourceUpdated: SendResourceUpdated | undefined;

/** Call once during server setup so the store can emit resource-updated notifications. */
export function initDiffStore(server: McpServer): void {
  const inner = (
    server as unknown as {
      server: { sendResourceUpdated: SendResourceUpdated };
    }
  ).server;
  sendResourceUpdated = inner.sendResourceUpdated.bind(inner);
}

export function storeDiff(data: DiffSlot): void {
  slot = data;
  void sendResourceUpdated?.({ uri: DIFF_RESOURCE_URI }).catch(() => {
    // Notification is best-effort; never block the tool response.
  });
}

export function getDiff(): DiffSlot | undefined {
  return slot;
}

export function hasDiff(): boolean {
  return slot !== undefined;
}

/** Test-only: directly set or clear the diff slot without emitting resource-updated. */
export function setDiffForTesting(data: DiffSlot | undefined): void {
  slot = data;
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
