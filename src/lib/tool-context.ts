import type { DiffStats, ParsedFile } from './diff.js';
import type { ToolExecutionContext } from './tool-factory.js';

const EMPTY_PARSED_FILES: readonly ParsedFile[] = [];
const EMPTY_DIFF_STATS = Object.freeze({
  files: 0,
  added: 0,
  deleted: 0,
}) as Readonly<DiffStats>;

export interface DiffContextSnapshot {
  diff: string;
  parsedFiles: readonly ParsedFile[];
  stats: Readonly<DiffStats>;
}

export function getDiffContextSnapshot(
  ctx: ToolExecutionContext
): DiffContextSnapshot {
  const slot = ctx.diffSlot;
  if (!slot) {
    return {
      diff: '',
      parsedFiles: EMPTY_PARSED_FILES,
      stats: EMPTY_DIFF_STATS,
    };
  }

  return {
    diff: slot.diff,
    parsedFiles: slot.parsedFiles,
    stats: slot.stats,
  };
}
