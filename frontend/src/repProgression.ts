import type { RepRange, TrackedSet } from './types';
import { formatWeight, weightFromKg, weightToKg, type WeightUnit } from './weightUnits';

/** Common ranges offered when planning an exercise, lowest reps first. */
export const REP_RANGE_PRESETS: RepRange[] = [
  { min: 3, max: 5 },
  { min: 5, max: 8 },
  { min: 6, max: 10 },
  { min: 8, max: 12 },
  { min: 10, max: 15 },
  { min: 12, max: 15 },
  { min: 15, max: 20 },
];

export function repRangeLabel(range: RepRange): string {
  return range.min === range.max ? String(range.min) : `${range.min}–${range.max}`;
}

export function repRangeKey(range: RepRange | null | undefined): string {
  return range ? `${range.min}-${range.max}` : '';
}

export function repRangeFromKey(key: string): RepRange | null {
  const [min, max] = key.split('-').map(Number);
  return isRepRange({ min, max }) ? { min, max } : null;
}

export function isRepRange(value: unknown): value is RepRange {
  if (typeof value !== 'object' || value === null) return false;
  const { min, max } = value as Record<string, unknown>;
  return (
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    (min as number) >= 1 &&
    (max as number) <= 100 &&
    (min as number) <= (max as number)
  );
}

type LoggedSet = Pick<TrackedSet, 'reps' | 'weight_kg' | 'warmup' | 'set_type' | 'completed'>;

export type ProgressionTarget =
  /** No earlier working sets to go on. */
  | { kind: 'start' }
  /** Every set at the top weight reached the highest reps: time to add load. */
  | { kind: 'increase'; weightKg: number; nextWeightKg: number | null }
  /** Keep the weight and add reps until the top of the range. */
  | { kind: 'hold'; weightKg: number };

/** The smallest usual jump: 2.5 kg, or 5 lb for people who train in pounds. */
function nextWeightKg(weightKg: number, unit: WeightUnit): number {
  if (unit === 'kg') return Math.round((weightKg + 2.5) * 100) / 100;
  return weightToKg(Math.round((weightFromKg(weightKg, 'lb') + 5) * 100) / 100, 'lb');
}

/**
 * Double progression from the last session: add reps at the same weight until every set at the
 * heaviest weight reaches the top of the range, then add weight. Warm-ups are ignored.
 */
export function progressionTarget(
  range: RepRange,
  lastSession: readonly LoggedSet[],
  unit: WeightUnit,
): ProgressionTarget {
  const working = lastSession.filter(
    (item) => item.completed && !item.warmup && item.set_type !== 'warmup' && item.reps != null,
  );
  if (!working.length) return { kind: 'start' };
  const weightKg = Math.max(...working.map((item) => item.weight_kg ?? 0));
  const topSets = working.filter((item) => (item.weight_kg ?? 0) === weightKg);
  if (topSets.every((item) => (item.reps ?? 0) >= range.max))
    return {
      kind: 'increase',
      weightKg,
      nextWeightKg: weightKg > 0 ? nextWeightKg(weightKg, unit) : null,
    };
  return { kind: 'hold', weightKg };
}

/** The weight a target points to, for pre-filling planned sets; null when it names none. */
export function progressionWeightKg(target: ProgressionTarget): number | null {
  if (target.kind === 'increase') return target.nextWeightKg;
  return target.kind === 'hold' && target.weightKg > 0 ? target.weightKg : null;
}

/** One line for the exercise card, such as "Target 8–12 reps · try 82.5 kg". */
export function progressionHint(
  range: RepRange,
  target: ProgressionTarget,
  unit: WeightUnit,
): string {
  const goal = `Target ${repRangeLabel(range)} reps`;
  if (target.kind === 'increase')
    return target.nextWeightKg === null
      ? `${goal} · top of range reached, add load`
      : `${goal} · try ${formatWeight(target.nextWeightKg, unit)}`;
  if (target.kind === 'hold' && target.weightKg > 0)
    return `${goal} · stay at ${formatWeight(target.weightKg, unit)}`;
  return goal;
}
