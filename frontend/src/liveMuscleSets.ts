import { partialSetsEnabledForWeek } from './exercisePartialSets';
import { finishedWorkoutKey, type FinishedWorkout } from './finishedWorkoutQueue';
import { previewIdFor } from './pendingWorkoutPreview';
import { isCompletedWorkingSet } from './workoutSets';
import type { ActiveWorkoutDraft } from './workoutDraft';
import type { Exercise, TrackedWorkout, WeeklyMuscleSets, WeeklySets } from './types';

export const LIVE_WORKOUT_ID = 'active-workout';
type MuscleSets = Pick<WeeklyMuscleSets, 'muscle_group' | 'raw_sets' | 'contributions'>;
/** The chart projects raw credits only; saved dashboard statistics remain authoritative. */
export type MuscleSetsWeek = Pick<WeeklySets, 'week_start' | 'week_end'> & {
  muscle_groups: MuscleSets[];
};

/** A finished workout counted before the dashboard includes it, with its own contribution id. */
export interface FinishedMuscleSource {
  id: string;
  draft: ActiveWorkoutDraft;
}

/**
 * The finished workouts the muscle sets count before the dashboard does: each one saved since
 * the dashboard loaded (under its saved id, so the refreshed dashboard's copy replaces it), then
 * each one waiting to sync that the server hasn't refused (refused ones wait for review).
 */
export function finishedMuscleSourcesFor(
  awaitingDashboard: readonly { id: string; finished: FinishedWorkout }[],
  queued: readonly FinishedWorkout[],
  refusals: Readonly<Record<string, unknown>>,
): FinishedMuscleSource[] {
  return [
    ...awaitingDashboard.map((item) => ({ id: item.id, draft: item.finished })),
    ...queued
      .filter((finished) => !(finishedWorkoutKey(finished) in refusals))
      .map((finished) => ({ id: previewIdFor(finished.pendingSave), draft: finished })),
  ];
}

/** Projects finished and in-progress workouts onto a week of muscle set credits. */
export function liveMuscleSetsWithFinished(
  week: MuscleSetsWeek,
  draft: ActiveWorkoutDraft | null,
  exercises: Exercise[],
  workouts: TrackedWorkout[],
  today: string,
  finished: readonly FinishedMuscleSource[] = [],
): MuscleSetsWeek {
  return liveMuscleSets(
    finished.reduce(
      (current, source) =>
        liveMuscleSets(current, source.draft, exercises, workouts, today, source.id),
      week,
    ),
    draft,
    exercises,
    workouts,
    today,
  );
}

export function liveMuscleSets(
  week: MuscleSetsWeek,
  draft: ActiveWorkoutDraft | null,
  exercises: Exercise[],
  workouts: TrackedWorkout[],
  today: string,
  /** Identifies an unsaved workout; each finished workout waiting to sync needs its own. */
  liveId: string = LIVE_WORKOUT_ID,
): MuscleSetsWeek {
  if (!draft) return week;
  const saved = workouts.find((workout) =>
    draft.resumingWorkoutId
      ? workout.id === draft.resumingWorkoutId
      : !!draft.clientSessionId && workout.client_session_id === draft.clientSessionId,
  );
  const workoutId = draft.resumingWorkoutId ?? saved?.id ?? liveId;
  const inWeek =
    draft.workoutDate >= week.week_start &&
    draft.workoutDate <= week.week_end &&
    draft.workoutDate <= today;
  const savedInWeek =
    saved && saved.workout_date >= week.week_start && saved.workout_date <= week.week_end;
  const replacesSaved = week.muscle_groups.some((group) =>
    group.contributions?.some((item) => item.workout_id === workoutId),
  );
  if (!inWeek && !replacesSaved && !savedInWeek) return week;
  const groups = new Map<string, MuscleSets>(
    week.muscle_groups.map((group) => {
      const previous = group.contributions?.filter((item) => item.workout_id === workoutId) ?? [];
      return [
        group.muscle_group,
        {
          ...group,
          raw_sets: group.raw_sets - previous.reduce((sum, item) => sum + item.set_credits, 0),
          contributions: group.contributions?.filter((item) => item.workout_id !== workoutId),
        },
      ];
    }),
  );
  // Old offline dashboards may lack the contribution list. Use the loaded original in that case.
  if (savedInWeek) {
    for (const movement of saved.movements) {
      const exercise =
        exercises.find((item) => item.id === movement.exercise.id) ?? movement.exercise;
      const count = movement.sets.filter(isCompletedWorkingSet).length;
      for (const credit of creditsForWeek(exercise, week.week_start)) {
        const group = groups.get(credit.muscle_name);
        if (group && !group.contributions) group.raw_sets -= count * credit.sets;
      }
    }
  }
  if (inWeek)
    for (const [index, movement] of draft.movements.entries()) {
      const exercise = exercises.find((item) => item.id === movement.exerciseId);
      if (!exercise) continue;
      const workingSets = movement.sets.filter(isCompletedWorkingSet).length;
      if (!workingSets) continue;
      for (const credit of creditsForWeek(exercise, week.week_start)) {
        const group = groups.get(credit.muscle_name) ?? {
          muscle_group: credit.muscle_name,
          raw_sets: 0,
          contributions: [],
        };
        const setCredits = workingSets * credit.sets;
        group.raw_sets += setCredits;
        group.contributions = [
          ...(group.contributions ?? []),
          {
            workout_id: workoutId,
            workout_name: draft.name,
            workout_date: draft.workoutDate,
            movement_id:
              saved?.movements.filter((item) => item.exercise.id === exercise.id)[
                draft.movements.slice(0, index).filter((item) => item.exerciseId === exercise.id)
                  .length
              ]?.id ?? movement.key,
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            working_sets: workingSets,
            credit_per_set: credit.sets,
            set_credits: setCredits,
          },
        ];
        groups.set(credit.muscle_name, group);
      }
    }
  return { ...week, muscle_groups: [...groups.values()] };
}

/** The muscles one working set of `exercise` credits in the week starting `weekStart`. */
export function creditsForWeek(exercise: Exercise, weekStart: string) {
  if (exercise.kind === 'cardio' || exercise.category === 'cardio') return [];
  const credits = exercise.default_muscle_set_credits ??
    exercise.muscle_set_credits ?? [{ muscle_name: exercise.muscle_group.trim(), sets: 1 }];
  return credits.filter(
    (credit) =>
      credit.muscle_name &&
      credit.sets > 0 &&
      (credit.sets >= 1 || partialSetsEnabledForWeek(exercise, weekStart)),
  );
}
