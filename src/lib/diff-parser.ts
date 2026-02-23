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

function sortPaths(paths: Iterable<string>): string[] {
  return Array.from(paths).sort(PATH_SORTER);
}

function calculateStats(files: readonly ParsedFile[]): DiffStats {
  return files.reduce(
    (acc, file) => ({
      files: acc.files + 1,
      added: acc.added + file.additions,
      deleted: acc.deleted + file.deletions,
    }),
    { files: 0, added: 0, deleted: 0 }
  );
}

function getUniquePaths(files: readonly ParsedFile[]): Set<string> {
  const paths = new Set<string>();
  for (const file of files) {
    const path = resolveChangedPath(file);
    if (path) {
      paths.add(path);
    }
  }
  return paths;
}

function generateSummaries(files: readonly ParsedFile[]): string[] {
  return files.map((file) => {
    const path = resolveChangedPath(file) ?? UNKNOWN_PATH;
    return `${path} (+${file.additions} -${file.deletions})`;
  });
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

  const stats = calculateStats(files);
  const summaries = generateSummaries(files);

  return {
    stats,
    summary: `${summaries.join(', ')} [${stats.files} files, +${stats.added} -${stats.deleted}]`,
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

  const stats = calculateStats(files);
  const paths = sortPaths(getUniquePaths(files));

  return {
    stats,
    paths,
  };
}

/** Extract all unique changed file paths (renamed: returns new path). */
export function extractChangedPathsFromFiles(
  files: readonly ParsedFile[]
): string[] {
  if (files.length === 0) {
    return EMPTY_PATHS;
  }
  return sortPaths(getUniquePaths(files));
}

/** Extract all unique changed file paths (renamed: returns new path). */
export function extractChangedPaths(diff: string): string[] {
  return extractChangedPathsFromFiles(parseDiffFiles(diff));
}

export function computeDiffStatsFromFiles(
  files: readonly ParsedFile[]
): Readonly<{ files: number; added: number; deleted: number }> {
  if (files.length === 0) {
    return EMPTY_STATS;
  }
  return calculateStats(files);
}

/** Count changed files, added lines, and deleted lines. */
export function computeDiffStats(
  diff: string
): Readonly<{ files: number; added: number; deleted: number }> {
  return computeDiffStatsFromFiles(parseDiffFiles(diff));
}

/** Generate human-readable summary of changed files and line counts. */
export function formatFileSummary(files: ParsedFile[]): string {
  return computeDiffStatsAndSummaryFromFiles(files).summary;
}
