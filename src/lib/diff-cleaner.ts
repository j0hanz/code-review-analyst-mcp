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

// Regex patterns to identify noisy diff file sections.
const BINARY_FILE_LINE = /^Binary files .+ differ$/m;
const GIT_BINARY_PATCH = /^GIT binary patch/m;
const HAS_HUNK = /^@@/m;
const HAS_OLD_MODE = /^old mode /m;

function shouldKeepSection(section: string): boolean {
  if (!section.trim()) {
    return false;
  }
  if (BINARY_FILE_LINE.test(section)) {
    return false;
  }
  if (GIT_BINARY_PATCH.test(section)) {
    return false;
  }
  if (HAS_OLD_MODE.test(section) && !HAS_HUNK.test(section)) {
    return false;
  }
  return true;
}

/**
 * Split raw unified diff into per-file sections and strip:
 * - Binary file sections ("Binary files a/... and b/... differ")
 * - GIT binary patch sections
 * - Mode-only sections (permission changes with no content hunks)
 *
 * Does NOT modify content lines (+ / - / space) to preserve verbatim
 * accuracy required by suggest_search_replace.
 */
export function cleanDiff(raw: string): string {
  if (!raw) return '';

  // Split on the start of each "diff --git" header, keeping the header.
  const sections = raw.split(/(?=^diff --git )/m);

  const cleaned = sections.filter(shouldKeepSection);

  return cleaned.join('').trim();
}

export function isEmptyDiff(diff: string): boolean {
  return diff.trim().length === 0;
}
