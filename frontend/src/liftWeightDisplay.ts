import type { LiftBest } from './types';
import { formatWeight, type WeightUnit } from './weightUnits';

// How a lift's best weights read wherever members' lifts are compared: the Friends ranking and the
// head to head. Pure and package-free, so the native app shares it (see AGENTS.md "Web and mobile
// parity"). LiftComparison.tsx can switch to it once #350 lands.

/** Normalised machine weights are approximate, as they are on the progress screen. */
export function liftBestApprox(best: Pick<LiftBest, 'normalised'>): string {
  return best.normalised ? '≈ ' : '';
}

/** A lift's estimated 1RM in the user's unit, prefixed with ≈ when machine-normalised. */
export function formatLiftEstimate(
  best: Pick<LiftBest, 'estimated_1rm' | 'normalised'>,
  unit: WeightUnit,
): string {
  return `${liftBestApprox(best)}${formatWeight(best.estimated_1rm, unit, 1)}`;
}

/** A lift's best set ("100 kg × 5"), prefixed with ≈ when machine-normalised. */
export function formatLiftBestSet(
  best: Pick<LiftBest, 'weight_kg' | 'reps' | 'normalised'>,
  unit: WeightUnit,
): string {
  return `${liftBestApprox(best)}${formatWeight(best.weight_kg, unit)} × ${best.reps}`;
}
