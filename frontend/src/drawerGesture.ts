/** A flick faster than this (pixels per millisecond) opens or closes the drawer whatever its position. */
export const FLICK_SPEED = 0.45;
/** Movement smaller than this is a tap on the handle, not a drag. */
export const DRAG_SLOP = 6;
/** A sheet or the live workout starts following the finger after this much movement. */
export const DRAG_START_PX = 8;
/** How far a sheet must be dragged to close (or the live workout to minimise), without a flick. */
export const DISMISS_MIN_PX = 72;
export const DISMISS_MAX_PX = 140;
export const DISMISS_VIEWPORT_SHARE = 0.12;
/** A flick still has to travel this far, so a quick twitch on the header never closes a sheet. */
export const FLICK_MIN_PX = 24;
/** Speed is measured over the last part of a drag, so a finger that stops before lifting has none. */
export const VELOCITY_WINDOW_MS = 100;

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

/** The drag distance that closes a sheet on a screen this tall. */
export function dismissDistance(viewport: number): number {
  return Math.min(DISMISS_MAX_PX, Math.max(DISMISS_MIN_PX, viewport * DISMISS_VIEWPORT_SHARE));
}

/**
 * Whether a downward drag closes a sheet (or minimises the live workout): far enough, or flicked.
 * A drag that is mostly sideways never does.
 */
export function commitsDrag(dy: number, dx: number, velocity: number, viewport: number): boolean {
  if (dy <= 0 || Math.abs(dx) >= 0.7 * Math.abs(dy)) return false;
  return dy >= dismissDistance(viewport) || (velocity >= FLICK_SPEED && dy >= FLICK_MIN_PX);
}

export type DragSample = { y: number; t: number };

/** Adds a pointer position and keeps only the samples the speed is measured over. */
export function trackDragSample(samples: DragSample[], y: number, t: number): DragSample[] {
  samples.push({ y, t });
  while (samples.length > 2 && t - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
  return samples;
}

/** Downward speed in pixels per millisecond over the recent samples (negative when moving up). */
export function dragVelocity(samples: readonly DragSample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsed = last.t - first.t;
  if (elapsed <= 0 || last.t - first.t > VELOCITY_WINDOW_MS * 2) return 0;
  return (last.y - first.y) / elapsed;
}
