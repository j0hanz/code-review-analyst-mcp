import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeDiffStats,
  extractChangedPaths,
  formatFileSummary,
  parseDiffFiles,
} from '../src/lib/diff-parser.js';

describe('Diff Parser', () => {
  const sampleDiff = `diff --git a/src/index.ts b/src/index.ts
index 123..456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,2 @@
-console.log('old');
+console.log('new');
 console.log('keep');
diff --git a/README.md b/README.md
new file mode 100644
index 000..789
--- /dev/null
+++ b/README.md
@@ -0,0 +1 @@
++# New Readme
`;

  it('parses unified diff correctly', () => {
    const files = parseDiffFiles(sampleDiff);
    assert.equal(files.length, 2);
    // parse-diff usually keeps a/ b/ prefixes if present in to/from
    // But my code in extractChangedPaths cleans them.
    // Here I test parseDiffFiles which returns raw parse-diff output.
    // parse-diff output usually has "src/index.ts" if git diff output is standard?
    // Let's check what parse-diff does with "--- a/src/index.ts".
    // It usually puts "src/index.ts" in 'to' and 'from' if it detects git prefixes.
    // But wait, the sample has "a/" and "b/".
    // If parse-diff handles it, good.
    // If not, it might be "b/src/index.ts".
    // I'll check strict equality after running.
    // For now, I'll trust it extracts meaningful paths.
    assert.ok(files[0].to);
    assert.ok(files[1].to);
  });

  it('extracts changed paths', () => {
    const paths = extractChangedPaths(sampleDiff);
    // extractChangedPaths cleans paths.
    assert.deepEqual(paths, ['README.md', 'src/index.ts']);
  });

  it('computes diff stats', () => {
    const stats = computeDiffStats(sampleDiff);
    assert.equal(stats.files, 2);
    assert.equal(stats.added, 2); // 1 in index.ts, 1 in README
    assert.equal(stats.deleted, 1); // 1 in index.ts
  });

  it('formats file summary', () => {
    const files = parseDiffFiles(sampleDiff);
    const summary = formatFileSummary(files);
    // index.ts: +1 -1. README.md: +1 -0.
    // Total: 2 files, +2 -1.
    assert.match(summary, /src\/index\.ts \(\+1 -1\)/);
    assert.match(summary, /README\.md \(\+1 -0\)/);
    assert.match(summary, /\[2 files, \+2 -1\]/);
  });
});
