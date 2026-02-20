import parseDiff from 'parse-diff';
import type { File as ParsedFile } from 'parse-diff';

export type { ParsedFile };
const UNKNOWN_PATH = 'unknown';
const NO_FILES_CHANGED = 'No files changed.';

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

  return Array.from(paths).sort((a, b) => a.localeCompare(b));
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
  if (files.length === 0) {
    return NO_FILES_CHANGED;
  }

  let totalAdded = 0;
  let totalDeleted = 0;
  const summaries: string[] = [];

  for (const file of files) {
    totalAdded += file.additions;
    totalDeleted += file.deletions;
    const path = resolveChangedPath(file) ?? UNKNOWN_PATH;
    summaries.push(`${path} (+${file.additions} -${file.deletions})`);
  }

  return `${summaries.join(', ')} [${files.length} files, +${totalAdded} -${totalDeleted}]`;
}
