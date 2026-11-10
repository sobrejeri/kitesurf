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

export function isFreshSwipePreview<T extends { fetchedAt: number }>(
  preview: T | undefined,
  now = Date.now(),
): preview is T {
  return Boolean(preview && now >= preview.fetchedAt &&
    now - preview.fetchedAt < SWIPE_PREVIEW_TTL_MS);
}

/** Width of the edge strips where a Safari tab starts its history swipe. */
export const SWIPE_EDGE_GUARD_PX = 28;

/**
 * Cancelling a touchstart cancels that touch's scrolling too, so it is only
 * worth doing where Safari would otherwise start its edge history gesture:
 * in a browser tab, within the outer strips. An installed PWA (standalone)
 * has no such gesture, so blocking there only breaks vertical scrolling.
 */
export function shouldBlockEdgeTouchStart(
  clientX: number,
  viewportWidthPx: number,
  standalone: boolean,
): boolean {
  if (standalone || !Number.isFinite(clientX) ||
    !Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) return false;
  return clientX <= SWIPE_EDGE_GUARD_PX || clientX >= viewportWidthPx - SWIPE_EDGE_GUARD_PX;
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
