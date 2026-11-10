/** Shared, browser-independent guardrails for the student's five-tab swipe pager.
 * The route only changes after a committed gesture. A stale or unsuccessful
 * navigation must never leave a translated visual preview over the real page.
 */
export const SWIPE_PREVIEW_TTL_MS = 45_000;
export const SWIPE_ROUTE_STALL_MS = 3_500;

export function nextStudentSwipeRoute(
  routes: readonly string[],
  currentIndex: number,
  direction: -1 | 1,
): string | null {
  if (currentIndex < 0 || currentIndex >= routes.length) return null;
  return routes[currentIndex + direction] ?? null;
}

export function isFreshSwipePreview(
  preview: { fetchedAt: number } | undefined,
  now = Date.now(),
): boolean {
  return Boolean(preview && now >= preview.fetchedAt &&
    now - preview.fetchedAt < SWIPE_PREVIEW_TTL_MS);
}

export function shouldCommitStudentSwipe(
  distancePx: number,
  elapsedMs: number,
  viewportWidthPx: number,
): boolean {
  if (!Number.isFinite(distancePx) || !Number.isFinite(elapsedMs) ||
    !Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0 ||
    distancePx < 0) return false;
  return distancePx > viewportWidthPx * 0.25 ||
    (distancePx > 48 && distancePx / Math.max(1, elapsedMs) > 0.6);
}
