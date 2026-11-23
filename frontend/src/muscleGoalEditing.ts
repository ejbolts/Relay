import { setCredits } from './muscleSetRows';
import type { MuscleSetGoals } from './muscleSetGoals';
import { exerciseSetCredits } from './splitTargets';
import type { Exercise, WeeklyMuscleContribution } from './types';

// Editing per-muscle weekly set goals, from Home's Sets per muscle card and the goals list.

export const MUSCLE_SET_GOAL_MIN = 1;
export const MUSCLE_SET_GOAL_MAX = 1000;
export const MUSCLE_SET_GOAL_ERROR = 'Enter a whole number of sets from 1 to 1,000.';

export function validMuscleSetGoal(value: number): boolean {
  return Number.isInteger(value) && value >= MUSCLE_SET_GOAL_MIN && value <= MUSCLE_SET_GOAL_MAX;
}

/** The goal field after a − or + step, starting from `goal` while the field is not a number. */
export function stepMuscleSetGoal(draft: string, goal: number, by: number): string {
  const value = Number(draft);
  const base = Number.isInteger(value) && value >= MUSCLE_SET_GOAL_MIN ? value : goal;
  return String(Math.min(MUSCLE_SET_GOAL_MAX, Math.max(MUSCLE_SET_GOAL_MIN, base + by)));
}

/** The account's goals with one muscle's changed; `null` returns it to the default goal. */
export function withMuscleSetGoal(
  goals: MuscleSetGoals | undefined,
  muscle: string,
  goal: number | null,
): MuscleSetGoals {
  const next = { ...(goals ?? {}) };
  if (goal === null) delete next[muscle];
  else next[muscle] = goal;
  return next;
}

export function muscleGoalSavedMessage(muscle: string, goal: number | null): string {
  return goal === null ? `${muscle} uses the default goal` : `${muscle} goal set to ${goal} sets`;
}

/** Every muscle an exercise credits, and any with a goal already, alphabetically. */
export function goalMuscles(exercises: Exercise[], goals: MuscleSetGoals = {}): string[] {
  return [
    ...new Set([
      ...exercises.flatMap((exercise) => exerciseSetCredits(exercise).map((item) => item.muscle)),
      ...Object.keys(goals),
    ]),
  ].sort((a, b) => a.localeCompare(b));
}

/** "3 working sets × 0.5 · Assistance": how a workout's exercise counted towards a muscle. */
export function contributionDetail(contribution: WeeklyMuscleContribution): string {
  return `${contribution.working_sets} working ${contribution.working_sets === 1 ? 'set' : 'sets'} × ${setCredits(contribution.credit_per_set)} · ${contribution.credit_per_set >= 1 ? 'Direct' : 'Assistance'}`;
}
