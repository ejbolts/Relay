import type { WorkoutCategory, WorkoutType, WorkoutTypeColors } from './types';

/** The colour a workout type is drawn in: its own when custom, otherwise the built-in palette. */
export function workoutTypeColor(type: WorkoutType, categoryColors?: WorkoutTypeColors): string {
  return type.is_custom ? type.color : (categoryColors?.[type.id as WorkoutCategory] ?? type.color);
}

/** A day's border: one flat colour, or equal arcs around it when the day mixes workout types. */
export function dayRing(colors: string[]): string {
  if (colors.length <= 1) return colors[0] ?? '';
  const step = 360 / colors.length;
  return `conic-gradient(from -45deg, ${colors
    .map((color, index) => `${color} ${index * step}deg ${(index + 1) * step}deg`)
    .join(', ')})`;
}
