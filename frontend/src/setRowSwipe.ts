export const SET_ROW_DELETE_SWIPE_PX = 88;
export const SET_ROW_SWIPE_MAX_PX = 132;

export function setRowSwipeOffset(deltaX: number): number {
  return Math.max(-SET_ROW_SWIPE_MAX_PX, Math.min(0, deltaX));
}

export function setRowSwipeProgress(offsetX: number): number {
  return Math.min(1, Math.abs(Math.min(0, offsetX)) / SET_ROW_DELETE_SWIPE_PX);
}

export function completesSetRowDeleteSwipe(deltaX: number, deltaY: number): boolean {
  return deltaX <= -SET_ROW_DELETE_SWIPE_PX && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
}
