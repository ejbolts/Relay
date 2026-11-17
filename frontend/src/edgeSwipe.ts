export const EDGE_SWIPE_START_PX = 32;
export const EDGE_SWIPE_DISTANCE_PX = 76;

export function completesEdgeSwipe(deltaX: number, deltaY: number): boolean {
  return deltaX >= EDGE_SWIPE_DISTANCE_PX && deltaX > Math.abs(deltaY) * 1.35;
}

/**
 * Decides early whether an edge drag is a back swipe. Vertical drags are released so the page
 * can scroll; a clearly rightward drag is claimed before the browser starts its own gesture.
 */
export function edgeSwipeIntent(
  deltaX: number,
  deltaY: number,
): 'undecided' | 'horizontal' | 'cancel' {
  if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) return 'cancel';
  if (deltaX < -8) return 'cancel';
  if (deltaX <= 8 || deltaX <= Math.abs(deltaY)) return 'undecided';
  return 'horizontal';
}
