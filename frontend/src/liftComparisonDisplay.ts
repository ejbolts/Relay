import { formatLiftEstimate } from './liftWeightDisplay';
import type { LiftComparison } from './types';
import type { WeightUnit } from './weightUnits';

// Pure comparison rules matching LiftComparison.tsx (shared with mobile/; switch
// LiftComparison.tsx to import from here once #350 lands).

/** The most lifts a head to head can show. */
export const MAX_HEAD_TO_HEAD_LIFTS = 20;

export type LiftLeader = 'you' | 'them' | 'level';

/** Who leads a lift both members have logged. */
export function leaderOf(lift: LiftComparison): LiftLeader | null {
  if (!lift.yours || !lift.theirs) return null;
  if (lift.yours.estimated_1rm === lift.theirs.estimated_1rm) return 'level';
  return lift.yours.estimated_1rm > lift.theirs.estimated_1rm ? 'you' : 'them';
}

function liftCount(lifts: number): string {
  return `${lifts} ${lifts === 1 ? 'lift' : 'lifts'}`;
}

/** Your percentage share of the split bar when both members logged the lift. */
export function liftBarShare(lift: LiftComparison): number | null {
  if (!lift.yours || !lift.theirs) return null;
  const total = lift.yours.estimated_1rm + lift.theirs.estimated_1rm;
  if (total <= 0) return null;
  return (lift.yours.estimated_1rm / total) * 100;
}

/** Overall score across the chosen lifts both members have logged, with its spoken summary. */
export function headToHeadScore(chosen: readonly LiftComparison[], memberName: string) {
  const leaders = chosen.map(leaderOf);
  const yours = leaders.filter((leader) => leader === 'you').length;
  const theirs = leaders.filter((leader) => leader === 'them').length;
  const level = leaders.filter((leader) => leader === 'level').length;
  const label = [
    `You lead ${liftCount(yours)}`,
    `${memberName} leads ${liftCount(theirs)}`,
    level ? `${liftCount(level)} level` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return { yours, theirs, level, scored: yours + theirs + level, label };
}

/** Spoken summary of a single head-to-head lift row. */
export function liftRowSummary(lift: LiftComparison, memberName: string, unit: WeightUnit): string {
  return `${lift.name}: you ${lift.yours ? formatLiftEstimate(lift.yours, unit) : 'no sets yet'}, ${memberName} ${lift.theirs ? formatLiftEstimate(lift.theirs, unit) : 'no sets yet'}`;
}

/**
 * Chosen lifts lead in their selection order, then the ones both members have logged, then theirs,
 * then yours, then the rest, breaking ties by name.
 */
export function orderLiftsForPicker(
  lifts: readonly LiftComparison[],
  selected: readonly string[],
): Array<LiftComparison & { id: string }> {
  const rank = (lift: LiftComparison) => {
    const position = selected.indexOf(lift.exercise_id);
    if (position >= 0) return position;
    const logged = lift.yours && lift.theirs ? 0 : lift.theirs ? 1 : lift.yours ? 2 : 3;
    return selected.length + logged;
  };
  return lifts
    .map((lift) => ({ ...lift, id: lift.exercise_id }))
    .sort((first, second) => rank(first) - rank(second) || first.name.localeCompare(second.name));
}

/** Toggles one lift in the selection, respecting the maximum lift cap. */
export function toggleLiftSelection(
  current: readonly string[],
  exerciseId: string,
  max = MAX_HEAD_TO_HEAD_LIFTS,
): string[] {
  if (current.includes(exerciseId)) return current.filter((id) => id !== exerciseId);
  if (current.length >= max) return [...current];
  return [...current, exerciseId];
}
