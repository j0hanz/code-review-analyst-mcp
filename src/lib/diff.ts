import parseDiff from 'parse-diff';
import type { File as ParsedFile } from 'parse-diff';

import { formatUsNumber } from './contract-format.js';
import { createCachedEnvInt } from './env-config.js';
import { createErrorToolResponse, type ErrorMeta } from './tool-response.js';

export type { ParsedFile };

// --- Diff Budget ---

const DEFAULT_MAX_DIFF_CHARS = 120_000;
const MAX_DIFF_CHARS_ENV_VAR = 'MAX_DIFF_CHARS';

const diffCharsConfig = createCachedEnvInt(
  MAX_DIFF_CHARS_ENV_VAR,
  DEFAULT_MAX_DIFF_CHARS
);

export function getMaxDiffChars(): number {
  return diffCharsConfig.get();
}

export function resetMaxDiffCharsCacheForTesting(): void {
  diffCharsConfig.reset();
}

export function exceedsDiffBudget(diff: string): boolean {
  return diff.length > getMaxDiffChars();
}

export function getDiffBudgetError(
  diffLength: number,
  maxChars = getMaxDiffChars()
): string {
  return `diff exceeds max allowed size (${formatUsNumber(diffLength)} chars > ${formatUsNumber(maxChars)} chars)`;
}

const BUDGET_ERROR_META: ErrorMeta = { retryable: false, kind: 'budget' };

export function validateDiffBudget(
  diff: string
): ReturnType<typeof createErrorToolResponse> | undefined {
  const providedChars = diff.length;
  const maxChars = getMaxDiffChars();
  if (providedChars <= maxChars) {
    return undefined;
  }

  return createErrorToolResponse(
    'E_INPUT_TOO_LARGE',
    getDiffBudgetError(providedChars, maxChars),
    { providedChars, maxChars },
    BUDGET_ERROR_META
  );
}

// --- Diff Cleaner ---

export const NOISY_EXCLUDE_PATHSPECS = [
  ':(exclude)package-lock.json',
  ':(exclude)yarn.lock',
  ':(exclude)pnpm-lock.yaml',
  ':(exclude)bun.lockb',
  ':(exclude)*.lock',
  ':(exclude)dist/',
  ':(exclude)build/',
  ':(exclude)out/',
  ':(exclude).next/',
  ':(exclude)coverage/',
  ':(exclude)*.min.js',
  ':(exclude)*.min.css',
  ':(exclude)*.map',
] as const;

const BINARY_FILE_LINE = /^Binary files .+ differ$/m;
const GIT_BINARY_PATCH = /^GIT binary patch/m;
const HAS_HUNK = /^@@/m;
const HAS_OLD_MODE = /^old mode /m;

function shouldKeepSection(section: string): boolean {
  return (
    Boolean(section.trim()) &&
    !BINARY_FILE_LINE.test(section) &&
    !GIT_BINARY_PATCH.test(section) &&
    (!HAS_OLD_MODE.test(section) || HAS_HUNK.test(section))
  );
}

function processSection(
  raw: string,
  start: number,
  end: number,
  sections: string[]
): void {
  if (end > start) {
    const section = raw.slice(start, end);
    if (shouldKeepSection(section)) {
      sections.push(section);
    }
  }
}

function extractAllSections(
  raw: string,
  sections: string[],
  firstIndex: number
): void {
  let lastIndex = 0;
  let nextIndex = firstIndex;
  while (nextIndex !== -1) {
    const matchIndex = nextIndex === 0 ? 0 : nextIndex + 1; // +1 to skip \n
    processSection(raw, lastIndex, matchIndex, sections);
    lastIndex = matchIndex;
    nextIndex = raw.indexOf('\ndiff --git ', lastIndex);
  }
  processSection(raw, lastIndex, raw.length, sections);
}

export function cleanDiff(raw: string): string {
  if (!raw) return '';

  const sections: string[] = [];
  const nextIndex = raw.startsWith('diff --git ')
    ? 0
    : raw.indexOf('\ndiff --git ');

  if (nextIndex === -1) {
    processSection(raw, 0, raw.length, sections);
  } else {
    extractAllSections(raw, sections, nextIndex);
  }

  return sections.join('').trim();
}

export function isEmptyDiff(diff: string): boolean {
  return diff.trim().length === 0;
}

// --- Diff Parser ---

const UNKNOWN_PATH = 'unknown';
const NO_FILES_CHANGED = 'No files changed.';
const EMPTY_PATHS: string[] = [];
export const EMPTY_DIFF_STATS: Readonly<DiffStats> = Object.freeze({
  files: 0,
  added: 0,
  deleted: 0,
});
const PATH_SORTER = (left: string, right: string): number =>
  left.localeCompare(right);

export interface DiffStats {
  files: number;
  added: number;
  deleted: number;
}

export function parseDiffFiles(diff: string): ParsedFile[] {
  return diff ? parseDiff(diff) : [];
}

function cleanPath(path: string): string {
  if (path.startsWith('a/') || path.startsWith('b/')) {
    return path.slice(2);
  }
  return path;
}

function resolveChangedPath(file: ParsedFile): string | undefined {
  if (file.to && file.to !== '/dev/null') return cleanPath(file.to);
  if (file.from && file.from !== '/dev/null') return cleanPath(file.from);
  return undefined;
}

function sortPaths(paths: Iterable<string>): string[] {
  return Array.from(paths).sort(PATH_SORTER);
}

function calculateStats(files: readonly ParsedFile[]): DiffStats {
  let added = 0;
  let deleted = 0;
  for (const file of files) {
    added += file.additions;
    deleted += file.deletions;
  }
  return { files: files.length, added, deleted };
}

function getUniquePaths(files: readonly ParsedFile[]): Set<string> {
  const paths = new Set<string>();
  for (const file of files) {
    const path = resolveChangedPath(file);
    if (path) paths.add(path);
  }
  return paths;
}

function buildFileSummaryList(
  files: readonly ParsedFile[],
  maxFiles = 40
): string[] {
  return files.slice(0, maxFiles).map((file) => {
    const path = resolveChangedPath(file) ?? UNKNOWN_PATH;
    return `${path} (+${Math.max(0, file.additions)} -${Math.max(0, file.deletions)})`;
  });
}

export function computeDiffStatsAndSummaryFromFiles(
  files: readonly ParsedFile[]
): Readonly<{ stats: DiffStats; summary: string }> {
  if (files.length === 0) {
    return { stats: EMPTY_DIFF_STATS, summary: NO_FILES_CHANGED };
  }

  const stats = calculateStats(files);
  const MAX_SUMMARY_FILES = 40;
  const summaries = buildFileSummaryList(files, MAX_SUMMARY_FILES);

  if (files.length > MAX_SUMMARY_FILES) {
    summaries.push(`... and ${files.length - MAX_SUMMARY_FILES} more files`);
  }

  return {
    stats,
    summary: `${summaries.join(', ')} [${stats.files} files, +${stats.added} -${Math.abs(stats.deleted)}]`,
  };
}

export function computeDiffStatsAndPathsFromFiles(
  files: readonly ParsedFile[]
): Readonly<{ stats: DiffStats; paths: string[] }> {
  if (files.length === 0) {
    return { stats: EMPTY_DIFF_STATS, paths: EMPTY_PATHS };
  }
  const stats = calculateStats(files);
  const paths = sortPaths(getUniquePaths(files));
  return { stats, paths };
}

export function extractChangedPathsFromFiles(
  files: readonly ParsedFile[]
): string[] {
  if (files.length === 0) return EMPTY_PATHS;
  return sortPaths(getUniquePaths(files));
}

export function extractChangedPaths(diff: string): string[] {
  return extractChangedPathsFromFiles(parseDiffFiles(diff));
}

export function computeDiffStatsFromFiles(
  files: readonly ParsedFile[]
): Readonly<DiffStats> {
  if (files.length === 0) return EMPTY_DIFF_STATS;
  return calculateStats(files);
}

export function computeDiffStats(diff: string): Readonly<DiffStats> {
  return computeDiffStatsFromFiles(parseDiffFiles(diff));
}

export function formatFileSummary(files: ParsedFile[]): string {
  return computeDiffStatsAndSummaryFromFiles(files).summary;
}
