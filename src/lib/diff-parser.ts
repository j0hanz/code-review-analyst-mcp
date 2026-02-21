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

interface DiffComputation {
  added: number;
  deleted: number;
  paths: Set<string>;
  summaries: string[];
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

function sortPaths(paths: ReadonlySet<string>): string[] {
  if (paths.size === 0) {
    return EMPTY_PATHS;
  }

  return Array.from(paths).sort(PATH_SORTER);
}

function buildDiffComputation(
  files: readonly ParsedFile[],
  options: { needPaths: boolean; needSummaries: boolean }
): DiffComputation {
  let added = 0;
  let deleted = 0;
  const paths = options.needPaths ? new Set<string>() : undefined;
  const summaries = options.needSummaries
    ? new Array<string>(files.length)
    : undefined;

  let index = 0;
  for (const file of files) {
    added += file.additions;
    deleted += file.deletions;

    if (options.needPaths || options.needSummaries) {
      const path = resolveChangedPath(file);
      if (paths && path) {
        paths.add(path);
      }

      if (summaries) {
        summaries[index] =
          `${path ?? UNKNOWN_PATH} (+${file.additions} -${file.deletions})`;
      }
    }
    index += 1;
  }

  return {
    added,
    deleted,
    paths: paths ?? new Set<string>(),
    summaries: summaries ?? [],
  };
}

function buildStats(
  filesCount: number,
  added: number,
  deleted: number
): DiffStats {
  return { files: filesCount, added, deleted };
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

  const computed = buildDiffComputation(files, {
    needPaths: false,
    needSummaries: true,
  });
  const stats = buildStats(files.length, computed.added, computed.deleted);

  return {
    stats,
    summary: `${computed.summaries.join(', ')} [${stats.files} files, +${stats.added} -${stats.deleted}]`,
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

  const computed = buildDiffComputation(files, {
    needPaths: true,
    needSummaries: false,
  });
  return {
    stats: buildStats(files.length, computed.added, computed.deleted),
    paths: sortPaths(computed.paths),
  };
}

/** Extract all unique changed file paths (renamed: returns new path). */
export function extractChangedPathsFromFiles(
  files: readonly ParsedFile[]
): string[] {
  if (files.length === 0) {
    return EMPTY_PATHS;
  }

  return sortPaths(
    buildDiffComputation(files, { needPaths: true, needSummaries: false }).paths
  );
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

  const computed = buildDiffComputation(files, {
    needPaths: false,
    needSummaries: false,
  });
  return buildStats(files.length, computed.added, computed.deleted);
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
