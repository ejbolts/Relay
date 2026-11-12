import type { WorkoutCategory, WorkoutType, WorkoutTypeColors } from './types';

/** The colour a workout type is drawn in: its own when custom, otherwise the built-in palette. */
export function workoutTypeColor(type: WorkoutType, categoryColors?: WorkoutTypeColors): string {
  return type.is_custom ? type.color : (categoryColors?.[type.id as WorkoutCategory] ?? type.color);
}

function relativeLuminance(color: string): number | null {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color.trim())?.[1];
  if (!hex || hex.length === 5 || hex.length === 7) return null;
  const digits =
    hex.length < 6 ? [...hex.slice(0, 3)].map((digit) => digit + digit) : hex.match(/../g)!;
  const [red, green, blue] = digits.slice(0, 3).map((pair) => {
    const channel = parseInt(pair, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * Black or white text for a filled day, whichever contrasts better (WCAG ratio). A day split
 * between several colours gets the one that stays most readable on its weakest colour.
 */
export function readableInk(fills: string[]): '#000000' | '#ffffff' {
  const luminances = fills.map(relativeLuminance).filter((value) => value !== null);
  if (!luminances.length) return '#ffffff';
  const onBlack = Math.min(...luminances.map((luminance) => (luminance + 0.05) / 0.05));
  const onWhite = Math.min(...luminances.map((luminance) => 1.05 / (luminance + 0.05)));
  return onBlack > onWhite ? '#000000' : '#ffffff';
}

/** One flat colour, or equal diagonal bands when a day mixes workout types. */
export function dayFill(fills: string[]): string {
  if (fills.length <= 1) return fills[0] ?? '';
  const step = 100 / fills.length;
  return `linear-gradient(135deg, ${fills
    .map((fill, index) => `${fill} ${index * step}% ${(index + 1) * step}%`)
    .join(', ')})`;
}
