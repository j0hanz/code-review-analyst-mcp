import parseDiff from 'parse-diff';
import type { File as ParsedFile } from 'parse-diff';

export type { ParsedFile };

/** Parse unified diff string into structured file list. */
export function parseDiffFiles(diff: string): ParsedFile[] {
  if (!diff) return [];
  return parseDiff(diff);
}

function cleanPath(path: string): string {
  // Common git diff prefixes
  if (path.startsWith('a/') || path.startsWith('b/')) {
    return path.slice(2);
  }
  return path;
}

/** Extract all unique changed file paths (renamed: returns new path). */
export function extractChangedPaths(diff: string): string[] {
  const files = parseDiffFiles(diff);
  const paths = new Set<string>();

  for (const file of files) {
    // Priority: to (new path) > from (old path)
    if (file.to && file.to !== '/dev/null') {
      paths.add(cleanPath(file.to));
    } else if (file.from && file.from !== '/dev/null') {
      paths.add(cleanPath(file.from));
    }
  }

  return Array.from(paths).sort((a, b) => a.localeCompare(b));
}

/** Count changed files, added lines, and deleted lines. */
export function computeDiffStats(
  diff: string
): Readonly<{ files: number; added: number; deleted: number }> {
  const files = parseDiffFiles(diff);
  let added = 0;
  let deleted = 0;
  for (const file of files) {
    added += file.additions;
    deleted += file.deletions;
  }
  return { files: files.length, added, deleted };
}

/**
 * Format a compact, human-readable file summary for prompt injection.
 * Example: "src/foo.ts (+12 -3), src/bar.ts (+0 -5) [2 files, +12 -8]"
 */
export function formatFileSummary(files: ParsedFile[]): string {
  if (files.length === 0) return 'No files changed.';

  const summaries = files.map((f) => {
    const rawPath = f.to && f.to !== '/dev/null' ? f.to : f.from;
    const path = rawPath ? cleanPath(rawPath) : 'unknown';
    return `${path} (+${f.additions} -${f.deletions})`;
  });

  const totalAdded = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeleted = files.reduce((sum, f) => sum + f.deletions, 0);

  return `${summaries.join(', ')} [${files.length} files, +${totalAdded} -${totalDeleted}]`;
}
