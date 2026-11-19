/** A flick faster than this (pixels per millisecond) opens or closes the drawer whatever its position. */
export const FLICK_SPEED = 0.45;
/** Movement smaller than this is a tap on the handle, not a drag. */
export const DRAG_SLOP = 6;

/** How open the drawer is while dragging: 0 shut, 1 fully open. Dragging down opens it. */
export function dragOpenness(from: number, dy: number, full: number): number {
  if (full <= 0) return from;
  return Math.min(1, Math.max(0, from + dy / full));
}

/**
 * Where the drawer settles after a drag: a quick flick goes the way it was flicked, otherwise it
 * goes to whichever side it is nearer.
 */
export function settleOpen(openness: number, velocity: number): boolean {
  if (Math.abs(velocity) >= FLICK_SPEED) return velocity > 0;
  return openness >= 0.5;
}
