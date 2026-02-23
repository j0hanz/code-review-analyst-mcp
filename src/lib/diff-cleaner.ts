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

  const sections: string[] = [];
  let lastIndex = 0;
  let nextIndex = raw.startsWith('diff --git ')
    ? 0
    : raw.indexOf('\ndiff --git ');

  if (nextIndex === -1) {
    processSection(raw, 0, raw.length, sections);
    return sections.join('').trim();
  }

  while (nextIndex !== -1) {
    const matchIndex = nextIndex === 0 ? 0 : nextIndex + 1; // +1 to skip \n
    processSection(raw, lastIndex, matchIndex, sections);
    lastIndex = matchIndex;
    nextIndex = raw.indexOf('\ndiff --git ', lastIndex);
  }

  processSection(raw, lastIndex, raw.length, sections);

  return sections.join('').trim();
}

export function isEmptyDiff(diff: string): boolean {
  return diff.trim().length === 0;
}
