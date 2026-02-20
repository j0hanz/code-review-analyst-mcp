import parseDiff from 'parse-diff';
import type { File as ParsedFile } from 'parse-diff';

export type { ParsedFile };
const UNKNOWN_PATH = 'unknown';
const NO_FILES_CHANGED = 'No files changed.';
const EMPTY_PATHS: string[] = [];
const EMPTY_STATS = Object.freeze({ files: 0, added: 0, deleted: 0 });
const PATH_SORTER = (left: string, right: string): number =>
  left.localeCompare(right);

interface DiffStats {
  files: number;
  added: number;
  deleted: number;
}

/** Parse unified diff string into structured file list. */
export function parseDiffFiles(diff: string): ParsedFile[] {
  if (!diff) {
    return [];
  }

  return parseDiff(diff);
}

function cleanPath(path: string): string {
  // Common git diff prefixes
  if (path.startsWith('a/') || path.startsWith('b/')) {
    return path.slice(2);
  }
  return path;
}

function resolveChangedPath(file: ParsedFile): string | undefined {
  if (file.to && file.to !== '/dev/null') {
    return cleanPath(file.to);
  }

  if (file.from && file.from !== '/dev/null') {
    return cleanPath(file.from);
  }

  return undefined;
}

function sortPaths(paths: Set<string>): string[] {
  if (paths.size === 0) {
    return EMPTY_PATHS;
  }

  return Array.from(paths).sort(PATH_SORTER);
}

export function computeDiffStatsAndSummaryFromFiles(
  files: readonly ParsedFile[]
): Readonly<{ stats: DiffStats; summary: string }> {
  if (files.length === 0) {
    return {
      stats: EMPTY_STATS,
      summary: NO_FILES_CHANGED,
    };
  }

  let added = 0;
  let deleted = 0;
  const summaries = new Array<string>(files.length);

  let index = 0;
  for (const file of files) {
    added += file.additions;
    deleted += file.deletions;

    const path = resolveChangedPath(file);
    summaries[index] =
      `${path ?? UNKNOWN_PATH} (+${file.additions} -${file.deletions})`;
    index += 1;
  }

  return {
    stats: { files: files.length, added, deleted },
    summary: `${summaries.join(', ')} [${files.length} files, +${added} -${deleted}]`,
  };
}

export function computeDiffStatsAndPathsFromFiles(
  files: readonly ParsedFile[]
): Readonly<{ stats: DiffStats; paths: string[] }> {
  if (files.length === 0) {
    return {
      stats: EMPTY_STATS,
      paths: EMPTY_PATHS,
    };
  }

  let added = 0;
  let deleted = 0;
  const paths = new Set<string>();

  for (const file of files) {
    added += file.additions;
    deleted += file.deletions;

    const path = resolveChangedPath(file);
    if (path) {
      paths.add(path);
    }
  }

  return {
    stats: { files: files.length, added, deleted },
    paths: sortPaths(paths),
  };
}

/** Extract all unique changed file paths (renamed: returns new path). */
export function extractChangedPathsFromFiles(
  files: readonly ParsedFile[]
): string[] {
  const paths = new Set<string>();

  for (const file of files) {
    const path = resolveChangedPath(file);
    if (path) {
      paths.add(path);
    }
  }

  return sortPaths(paths);
}

/** Extract all unique changed file paths (renamed: returns new path). */
export function extractChangedPaths(diff: string): string[] {
  return extractChangedPathsFromFiles(parseDiffFiles(diff));
}

export function computeDiffStatsFromFiles(
  files: readonly ParsedFile[]
): Readonly<{ files: number; added: number; deleted: number }> {
  let added = 0;
  let deleted = 0;

  for (const file of files) {
    added += file.additions;
    deleted += file.deletions;
  }

  return { files: files.length, added, deleted };
}

/** Count changed files, added lines, and deleted lines. */
export function computeDiffStats(
  diff: string
): Readonly<{ files: number; added: number; deleted: number }> {
  return computeDiffStatsFromFiles(parseDiffFiles(diff));
}

/**
 * Format a compact, human-readable file summary for prompt injection.
 * Example: "src/foo.ts (+12 -3), src/bar.ts (+0 -5) [2 files, +12 -8]"
 */
export function formatFileSummary(files: ParsedFile[]): string {
  return computeDiffStatsAndSummaryFromFiles(files).summary;
}
