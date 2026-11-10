/** A pure focus-trap decision for the mobile 'Mais' dialog.
 * -1 focuses the dialog panel itself, null keeps native Tab behavior.
 */
export function modalFocusDestination(
  direction: 'forward' | 'backward',
  currentIndex: number,
  focusableCount: number,
  focusedOnPanel = false,
): number | null {
  if (focusableCount === 0) return -1;
  if (direction === 'backward' && (focusedOnPanel || currentIndex <= 0)) {
    return focusableCount - 1;
  }
  if (direction === 'forward' && (currentIndex === focusableCount - 1 ||
      (currentIndex < 0 && !focusedOnPanel))) {
    return 0;
  }
  return null;
}
