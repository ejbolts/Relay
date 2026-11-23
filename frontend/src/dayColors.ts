import type { WorkoutCategory, WorkoutType, WorkoutTypeColors } from './types';

/** The colour a workout type is drawn in: its own when custom, otherwise the built-in palette. */
export function workoutTypeColor(type: WorkoutType, categoryColors?: WorkoutTypeColors): string {
  return type.is_custom ? type.color : (categoryColors?.[type.id as WorkoutCategory] ?? type.color);
}

/** Clear space between the arcs of a mixed day, so neighbouring colours never touch. */
export const RING_GAP_DEG = 10;

/** A day's border: one flat colour, or equal arcs around it when the day mixes workout types. */
export function dayRing(colors: string[]): string {
  if (colors.length <= 1) return colors[0] ?? '';
  const step = 360 / colors.length;
  const half = RING_GAP_DEG / 2;
  const arcs = colors.map(
    (color, index) =>
      `transparent ${index * step}deg ${index * step + half}deg, ` +
      `${color} ${index * step + half}deg ${(index + 1) * step - half}deg, ` +
      `transparent ${(index + 1) * step - half}deg ${(index + 1) * step}deg`,
  );
  return `conic-gradient(from -45deg, ${arcs.join(', ')})`;
}

/**
 * A mixed day's colours as equal hard-edged stripes along `direction`, for bars and swatches; a
 * single colour stays flat.
 */
export function dayStripes(colors: string[], direction = 'to bottom'): string {
  if (colors.length <= 1) return colors[0] ?? '';
  const step = 100 / colors.length;
  const stops = colors.map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`);
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
