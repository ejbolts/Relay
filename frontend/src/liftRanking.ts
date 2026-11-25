// Package-free, so the native app can share it (see AGENTS.md "Web and mobile parity").
// Mirrors LiftComparison.tsx's lift ranking formatting rules (that file stays untouched while #350 is open).
// Its weights read as the head to head's do, through liftWeightDisplay.
import { formatLiftEstimate } from './liftWeightDisplay';
import type { LiftRanking } from './types';
import type { WeightUnit } from './weightUnits';

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
