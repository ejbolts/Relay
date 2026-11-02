import type { Exercise, RoutineDay } from './types';

export interface PlannedMuscleVolume {
  muscle: string;
  /** Average working-set credits per week. */
  sets: number;
}

export interface PlannedWeeklyVolume {
  cycleDays: number;
  muscles: PlannedMuscleVolume[];
  /** Average cardio minutes per week. */
  cardioMinutes: number;
}

export type TargetStatus = 'met' | 'close' | 'under';

/** The muscles an exercise credits per working set, matching the weekly sets on Home. */
export function exerciseSetCredits(exercise: Exercise): { muscle: string; sets: number }[] {
  if (exercise.kind === 'cardio' || exercise.category === 'cardio') return [];
  if (exercise.muscle_set_credits)
    return exercise.muscle_set_credits
      .filter((credit) => credit.sets > 0)
      .map((credit) => ({ muscle: credit.muscle_name, sets: credit.sets }));
  const muscle = exercise.muscle_group.trim();
  return muscle ? [{ muscle, sets: 1 }] : [];
}

/** Credits for one session of a split day. Warm-ups are excluded, as in logged workouts. */
export function daySetCredits(day: RoutineDay): Map<string, number> {
  const totals = new Map<string, number>();
  for (const movement of day.movements) {
    const workSets = movement.sets.filter((set) => set.set_type !== 'warmup').length;
    if (!workSets) continue;
    for (const credit of exerciseSetCredits(movement.exercise))
      totals.set(credit.muscle, (totals.get(credit.muscle) ?? 0) + workSets * credit.sets);
  }
  return totals;
}

function dayCardioMinutes(day: RoutineDay): number {
  return day.movements
    .filter(({ exercise }) => exercise.kind === 'cardio' || exercise.category === 'cardio')
    .flatMap(({ sets }) => sets)
    .reduce((total, set) => total + (set.duration_seconds ?? 0) / 60, 0);
}

/**
 * Weekly volume if the split repeats without breaks. A cycle that is not seven days long
 * gives some weeks more sessions of a day than others, so totals are weekly averages.
 */
export function plannedWeeklyVolume(days: RoutineDay[]): PlannedWeeklyVolume {
  const cycleDays = days.length;
  const perWeek = cycleDays ? 7 / cycleDays : 0;
  const totals = new Map<string, number>();
  let cardio = 0;
  for (const day of days) {
    if (!day.workout_type_id) continue;
    for (const [muscle, sets] of daySetCredits(day))
      totals.set(muscle, (totals.get(muscle) ?? 0) + sets);
    cardio += dayCardioMinutes(day);
  }
  return {
    cycleDays,
    muscles: [...totals]
      .map(([muscle, sets]) => ({ muscle, sets: sets * perWeek }))
      .sort((left, right) => right.sets - left.sets || left.muscle.localeCompare(right.muscle)),
    cardioMinutes: cardio * perWeek,
  };
}

/** Compares the value as displayed, so "10 / 10" never shows as short. */
export function targetStatus(value: number, goal: number): TargetStatus {
  const shown = Math.round(value * 10) / 10;
  if (shown >= goal) return 'met';
  return shown >= goal * 0.7 ? 'close' : 'under';
}

/** One decimal place, without a trailing ".0". */
export function formatVolume(value: number): string {
  return (Math.round(value * 10) / 10).toLocaleString();
}
