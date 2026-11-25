// Package-free, so the native app can share it (see AGENTS.md "Web and mobile parity").
// Mirrors LiftComparison.tsx's lift ranking formatting rules (that file stays untouched while #350 is open).
import type { LiftBest, LiftRanking } from './types';
import { formatWeight, type WeightUnit } from './weightUnits';

/** Normalised machine weights are approximate, as they are on the progress screen. */
export function liftBestApprox(best: Pick<LiftBest, 'normalised'>): string {
  return best.normalised ? '≈ ' : '';
}

/** A lift's estimated 1RM formatted in the user's unit, prefixed with ≈ when machine-normalised. */
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

/** Display name for a lift ranking row: "You" for the signed-in member, else their display name. */
export function liftRankingName(entry: Pick<LiftRanking, 'is_you' | 'member'>): string {
  return entry.is_you ? 'You' : entry.member.display_name;
}

/** Accessible label for a lift ranking row, matching the web's LiftLeaderboardCard. */
export function liftRankingRowLabel(
  entry: LiftRanking,
  rank: number,
  unit: WeightUnit,
  canOpenMember: boolean,
): string {
  const base = `${rank}. ${liftRankingName(entry)}, ${formatLiftEstimate(entry.best, unit)}`;
  return !entry.is_you && canOpenMember ? `${base}. Open profile` : base;
}
