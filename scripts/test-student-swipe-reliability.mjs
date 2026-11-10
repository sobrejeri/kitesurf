import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isFreshSwipePreview, nextStudentSwipeRoute,
  shouldCommitStudentSwipe, SWIPE_PREVIEW_TTL_MS, SWIPE_ROUTE_STALL_MS,
} from '../src/lib/student-swipe-guards.ts';
import { safeSwipePreviewImageUrl } from '../src/lib/student-swipe-preview.ts';

const routes = ['/aluno/inicio', '/aluno/aulas', '/aluno/reservar',
  '/aluno/evolucao', '/aluno/conta'];
for (let index = 0; index < routes.length; index++) {
  assert.equal(nextStudentSwipeRoute(routes, index, -1), routes[index - 1] ?? null);
  assert.equal(nextStudentSwipeRoute(routes, index, 1), routes[index + 1] ?? null);
}
assert.equal(nextStudentSwipeRoute(routes, -1, 1), null);
assert.equal(nextStudentSwipeRoute(routes, 5, -1), null);

const now = 9_000_000;
assert.equal(isFreshSwipePreview(undefined, now), false);
assert.equal(isFreshSwipePreview({ fetchedAt: now - SWIPE_PREVIEW_TTL_MS + 1 }, now), true);
assert.equal(isFreshSwipePreview({ fetchedAt: now - SWIPE_PREVIEW_TTL_MS }, now), false);
assert.equal(isFreshSwipePreview({ fetchedAt: now + 1 }, now), false);
assert.equal(shouldCommitStudentSwipe(100, 1000, 390), true);
assert.equal(shouldCommitStudentSwipe(60, 70, 390), true);
assert.equal(shouldCommitStudentSwipe(40, 70, 390), false);
assert.equal(shouldCommitStudentSwipe(60, 1000, 390), false);
assert.equal(shouldCommitStudentSwipe(-10, 100, 390), false);
assert.equal(shouldCommitStudentSwipe(100, 100, 0), false);
assert.ok(SWIPE_ROUTE_STALL_MS >= 2000 && SWIPE_ROUTE_STALL_MS <= 5000);

const origin = 'https://vento-kitesurf.onrender.com';
assert.equal(safeSwipePreviewImageUrl('/images/hero.webp', origin), '/images/hero.webp');
assert.equal(safeSwipePreviewImageUrl('/_next/image?url=%2Fimages%2Fhero.webp&w=640&q=75', origin),
  '/_next/image?url=%2Fimages%2Fhero.webp&w=640&q=75');
assert.equal(safeSwipePreviewImageUrl('/icon.svg', origin), '/icon.svg');
for (const source of [
  'javascript:alert(1)', 'data:image/svg+xml;base64,abc', 'blob:https://example.com/anything',
  'https://example.org/collect?email=1', '//example.org/img.png',
  'https://supabase.example.com/storage/v1/object/sign/private',
  '/api/booking/read', '/images-malicious/exfil.jpg',
]) {
  assert.equal(safeSwipePreviewImageUrl(source, origin), null,
    `Unsafe external or dynamic image in decorative preview: ${source}`);
}
const pager = readFileSync('src/components/student/swipe-pager.tsx', 'utf8');
const sanitizer = readFileSync('src/lib/student-swipe-preview.ts', 'utf8');
assert.match(pager, /sanitizeStudentSwipePreview\(main, window\.location\.origin\)/);
assert.match(pager, /controller\.signal\.aborted/);
assert.match(pager, /isFreshSwipePreview\(cache\.current\.get\(route\)\)/);
assert.match(pager, /routeWatchdog = window\.setTimeout\(reset, SWIPE_ROUTE_STALL_MS\)/);
assert.match(pager, /frame\.removeAttribute\('data-dragging'\)/);
assert.match(pager, /inFlight\.current\.clear\(\)/);
assert.match(pager, /'a', 'button', 'summary'/);
assert.match(sanitizer, /'script', 'style', 'iframe', 'object'/);
assert.match(sanitizer, /element\.removeAttribute\(attr\.name\)/);
assert.match(sanitizer, /element\.localName\.includes\('-'\)/);
assert.doesNotMatch(pager, /incoming\.innerHTML = main\.innerHTML/,
  'Never inject unsanitized authenticated HTML into a live document');
console.log('PASS: swipe boundaries, stale preview checks, failed-route recovery and sanitized inert snapshots');
