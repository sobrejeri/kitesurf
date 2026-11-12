import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as guards from '../src/lib/student-swipe-guards.ts';

// Reproduced at phone width on the five swipe-enabled student tabs: a
// vertical finger drag that starts within 28px of either screen edge did not
// scroll (0px vs 187-329px from the centre) because the pager called
// preventDefault() on that touchstart. Cancelling touchstart cancels the
// whole touch's scrolling. The cancel only exists to stop Safari's
// edge-swipe history gesture, which the installed PWA (display-mode
// standalone, the main way the student app is used) does not have.
const { shouldBlockEdgeTouchStart, SWIPE_EDGE_GUARD_PX } = guards;
assert.equal(typeof shouldBlockEdgeTouchStart, 'function',
  'Edge touch policy must be a tested pure helper');
assert.equal(SWIPE_EDGE_GUARD_PX, 28, 'Browser-tab edge guard keeps its original width');

const width = 390;
// Installed PWA: never cancel, so scrolling works from any starting point.
for (const x of [0, 6, 20, 28, 195, 362, 384, 390]) {
  assert.equal(shouldBlockEdgeTouchStart(x, width, true), false,
    `Standalone PWA must not block a touch starting at x=${x}`);
}
// Safari tab: detect only the outer 28px on each side.
assert.equal(shouldBlockEdgeTouchStart(6, width, false), true);
assert.equal(shouldBlockEdgeTouchStart(28, width, false), true);
assert.equal(shouldBlockEdgeTouchStart(29, width, false), false);
assert.equal(shouldBlockEdgeTouchStart(195, width, false), false);
assert.equal(shouldBlockEdgeTouchStart(362, width, false), true);
assert.equal(shouldBlockEdgeTouchStart(361, width, false), false);
// Invalid geometry never blocks.
assert.equal(shouldBlockEdgeTouchStart(Number.NaN, width, false), false);
assert.equal(shouldBlockEdgeTouchStart(10, 0, false), false);

const pager = readFileSync('src/components/student/swipe-pager.tsx', 'utf8');
assert.match(pager, /shouldBlockEdgeTouchStart\(touch\.clientX, window\.innerWidth, isStandalone\(\)\)/,
  'The pager must use the tested edge policy with the real display mode');
assert.match(pager, /if \(!animateSwipe\) return;\s*event\.preventDefault\(\);/,
  'The iOS browser must keep its native edge gesture without starting app navigation');
assert.doesNotMatch(pager, /touch\.clientX <= 28 \|\| touch\.clientX >= window\.innerWidth - 28/,
  'The unconditional edge cancel must be gone');
assert.match(pager, /matchMedia\('\(display-mode: standalone\)'\)\.matches/,
  'Standalone detection must use display-mode');
assert.match(pager, /navigator as Navigator & \{ standalone\?: boolean \}\)\.standalone === true/,
  'Standalone detection must cover iOS home-screen apps');

console.log('PASS: edge-started vertical scrolling works in the installed PWA; iOS Safari edge navigation stays native');
