import type { Exercise } from './types';
import type { WeightUnit } from './weightUnits';

export type BarType = 'olympic' | 'ez' | 'trap';

/**
 * Typical bar weights. Only the Olympic bar is standardised (20 kg / 45 lb); EZ and trap bars
 * vary by brand (EZ about 7-14 kg, trap about 20-30 kg), so their weight can be changed.
 */
export const BAR_TYPES: Record<BarType, { label: string; weight: Record<WeightUnit, number> }> = {
  olympic: { label: 'Olympic bar', weight: { kg: 20, lb: 45 } },
  ez: { label: 'EZ bar', weight: { kg: 10, lb: 25 } },
  trap: { label: 'Trap bar', weight: { kg: 25, lb: 55 } },
};

export interface Plate {
  weight: number;
  colour: string;
  /** Label colour that stays readable on the plate. */
  ink: string;
  /** Drawn height and thickness, so heavier plates look bigger. */
  height: number;
  thickness: number;
}

/**
 * Plates from heaviest to lightest. Kilograms use competition colours; pounds give the matching
 * sizes the same colours (45 lb blue like 20 kg, 35 lb yellow, 25 lb green, 10 lb white).
 */
export const PLATES: Record<WeightUnit, readonly Plate[]> = {
  kg: [
    { weight: 25, colour: '#d64545', ink: '#fff', height: 116, thickness: 15 },
    { weight: 20, colour: '#2f6fd6', ink: '#fff', height: 116, thickness: 13 },
    { weight: 15, colour: '#e3b62f', ink: '#1b1404', height: 102, thickness: 11 },
    { weight: 10, colour: '#2f9e4f', ink: '#fff', height: 88, thickness: 10 },
    { weight: 5, colour: '#eef1f3', ink: '#1b1f23', height: 64, thickness: 8 },
    { weight: 2.5, colour: '#5a626b', ink: '#e9edf0', height: 50, thickness: 7 },
  ],
  lb: [
    { weight: 45, colour: '#2f6fd6', ink: '#fff', height: 116, thickness: 14 },
    { weight: 35, colour: '#e3b62f', ink: '#1b1404', height: 104, thickness: 12 },
    { weight: 25, colour: '#2f9e4f', ink: '#fff', height: 90, thickness: 10 },
    { weight: 10, colour: '#eef1f3', ink: '#1b1f23', height: 68, thickness: 8 },
    { weight: 5, colour: '#5a626b', ink: '#e9edf0', height: 54, thickness: 7 },
    { weight: 2.5, colour: '#9aa3ab', ink: '#1b1f23', height: 44, thickness: 6 },
  ],
};

export function plateFor(unit: WeightUnit, weight: number): Plate {
  return PLATES[unit].find((plate) => plate.weight === weight) ?? PLATES[unit][0];
}

/** Adding the lightest plate to both sides. */
export function plateStep(unit: WeightUnit): number {
  return PLATES[unit][PLATES[unit].length - 1].weight * 2;
}

/** The bar an exercise uses, from its equipment or name; null for anything else. */
export function barTypeForExercise(exercise: Pick<Exercise, 'name' | 'equipment'>): BarType | null {
  const text = `${exercise.equipment ?? ''} ${exercise.name}`.toLowerCase();
  if (/\b(trap|hex)[\s-]?bar\b/.test(text)) return 'trap';
  if (/\bez[\s-]?(curl[\s-]?)?bar\b|\bez[\s-]curl\b/.test(text)) return 'ez';
  // Smith machines and other machine bars carry their own counterbalanced weight.
  if (/\bsmith\b|machine/.test(text)) return null;
  return /\bbarbell\b/.test(text) ? 'olympic' : null;
}

// Hundredths keep 2.5 and 1.25 exact while adding and subtracting.
const units = (weight: number) => Math.round(weight * 100);

export interface PlateLoad {
  /** Plates for each side, heaviest first (nearest the collar). */
  perSide: number[];
  /** Bar plus both sides. */
  total: number;
  /** Weight per side that could not be made from whole plates. */
  shortPerSide: number;
}

export function plateTotal(bar: number, perSide: readonly number[]): number {
  return (units(bar) + 2 * perSide.reduce((sum, plate) => sum + units(plate), 0)) / 100;
}

/** Fills each side heaviest plate first, never going over the target. */
export function loadPlates(target: number, bar: number, unit: WeightUnit): PlateLoad {
  let remaining = Math.max(0, Math.floor((units(target) - units(bar)) / 2));
  const perSide: number[] = [];
  for (const { weight } of PLATES[unit]) {
    while (remaining >= units(weight)) {
      perSide.push(weight);
      remaining -= units(weight);
    }
  }
  return { perSide, total: plateTotal(bar, perSide), shortPerSide: remaining / 100 };
}

const BAR_STORAGE_KEY = 'gym-plate-calculator-bars';

interface SavedBar {
  type: BarType;
  weight: number;
  unit: WeightUnit;
}

function readSavedBars(): Record<string, SavedBar> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(BAR_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, SavedBar>) : {};
  } catch {
    return {};
  }
}

/** The bar last used for this exercise, or the usual one for its equipment. */
export function savedBar(
  exerciseId: string,
  fallback: BarType,
  unit: WeightUnit,
): { type: BarType; weight: number } {
  const saved = readSavedBars()[exerciseId];
  if (saved && saved.type in BAR_TYPES) {
    // A weight saved in the other unit would be a different bar; use the usual one instead.
    const weight =
      saved.unit === unit && saved.weight > 0 ? saved.weight : BAR_TYPES[saved.type].weight[unit];
    return { type: saved.type, weight };
  }
  return { type: fallback, weight: BAR_TYPES[fallback].weight[unit] };
}

export function saveBar(exerciseId: string, bar: SavedBar) {
  try {
    localStorage.setItem(
      BAR_STORAGE_KEY,
      JSON.stringify({ ...readSavedBars(), [exerciseId]: bar }),
    );
  } catch {
    // Storage can be unavailable in private browsing; the calculator still works.
  }
}
