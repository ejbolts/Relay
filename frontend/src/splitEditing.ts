// The rules for building and editing splits (saved routines), shared by the web's split
// library and the native app (mobile/). Keep this file free of packages and browser APIs: the
// app bundles it as it is.
import { CARDIO_ROW, dayCardioMinutes, daySetCredits, formatVolume } from './splitTargets';
import { followsWorkouts, MAX_SPLIT_DAYS, SPLIT_TEMPLATES } from './trainingSplit';
import type {
  Exercise,
  Routine,
  RoutineDay,
  RoutineMovement,
  RoutineSet,
  TrainingSplit,
  WorkoutType,
} from './types';

export type SplitTemplate = (typeof SPLIT_TEMPLATES)[number];

/** Exercises a split day can plan. */
export const MAX_PLANNED_EXERCISES = 20;
const MAX_PLANNED_SETS = 50;
const MAX_PLANNED_MINUTES = 600;
/** Cardio is planned in five-minute steps. */
const CARDIO_STEP_MINUTES = 5;

export const splitFailure = (reason: unknown) =>
  reason instanceof Error ? reason.message : 'Could not save the split. Try again.';

export const splitDayCount = (days: RoutineDay[]) =>
  `${days.length} ${days.length === 1 ? 'day' : 'days'}`;

/** A day's workout type, Rest, or Removed type when its type no longer exists. */
export function splitDayName(day: RoutineDay): string {
  return day.workout_type?.name ?? (day.workout_type_id ? 'Removed type' : 'Rest');
}

/** A template's name in the library; FBEOD reads as what it is. */
export function splitTemplateName(preset: SplitTemplate): string {
  return preset.id === 'fbeod' ? 'Full body / Rest' : preset.name;
}

/** Working sets (cardio excluded) and cardio minutes in one session of a day. */
function dayTotals(day: RoutineDay) {
  const sets = day.movements
    .filter(({ exercise }) => exercise.kind !== 'cardio')
    .reduce((total, movement) => total + movement.sets.length, 0);
  return { sets, minutes: Math.round(dayCardioMinutes(day)) };
}

/** A day's planned work, such as "12 sets · 20 min"; empty without any. */
export function splitDayTotal(day: RoutineDay): string {
  const { sets, minutes } = dayTotals(day);
  return [sets && `${sets} ${sets === 1 ? 'set' : 'sets'}`, minutes && `${minutes} min`]
    .filter(Boolean)
    .join(' · ');
}

/** A day in the editor's list, such as "4 exercises · 12 sets", Rest or No exercises. */
export function splitDaySummary(day: RoutineDay): string {
  if (!day.workout_type_id) return 'Rest';
  if (!day.movements.length) return 'No exercises';
  const { sets, minutes } = dayTotals(day);
  const parts = [
    `${day.movements.length} ${day.movements.length === 1 ? 'exercise' : 'exercises'}`,
  ];
  if (sets) parts.push(`${sets} ${sets === 1 ? 'set' : 'sets'}`);
  if (minutes) parts.push(`${minutes} min`);
  return parts.join(' · ');
}

/** What one session of a day adds to the selected volume row, such as "+3 sets". */
export function splitDayContribution(day: RoutineDay, selected: string | null): string | null {
  if (!selected || !day.workout_type_id) return null;
  if (selected === CARDIO_ROW) {
    const minutes = Math.round(dayCardioMinutes(day));
    return minutes ? `${minutes} min` : null;
  }
  const sets = daySetCredits(day).get(selected);
  return sets ? `+${formatVolume(sets)} ${sets === 1 ? 'set' : 'sets'}` : null;
}

/**
 * A split saved before the split library existed has no routine: show it as one, so it can be
 * edited and saved into the library.
 */
export function legacySplitRoutine(
  split: TrainingSplit | null | undefined,
  types: WorkoutType[],
): Routine | null {
  if (!split || split.routine_id) return null;
  return {
    id: 'current-split',
    name: split.name,
    shared: false,
    days: split.steps.map((step) => ({
      workout_type_id: step.workout_type_id,
      workout_type: types.find((t) => t.id === step.workout_type_id) ?? null,
      movements: [],
    })),
  };
}

/** The active plan leads; stable ordering keeps the rest of the library in place. */
export function splitsActiveFirst(items: Routine[], activeId: string | null | undefined) {
  return [...items].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId));
}

/** Whether the library already holds a split with the template's days. */
export function hasSplitTemplate(routines: Routine[] | null, preset: SplitTemplate): boolean {
  return (routines ?? []).some(
    (routine) =>
      routine.days.length === preset.types.length &&
      routine.days.every((day, index) => day.workout_type_id === preset.types[index]),
  );
}

/** A new, unsaved split from a template, or a one-day split for any other id ("custom"). */
export function routineFromTemplate(id: string, types: WorkoutType[]): Routine {
  const preset = SPLIT_TEMPLATES.find((t) => t.id === id) ?? {
    name: 'My split',
    types: [types.find((t) => !t.archived)?.id ?? 'upper'],
  };
  return {
    id: '',
    name: preset.name === 'FBEOD' ? 'Full body / Rest' : preset.name,
    shared: false,
    days: preset.types.map((typeId) => ({
      workout_type_id: typeId,
      workout_type: types.find((t) => t.id === typeId) ?? null,
      movements: [],
    })),
  };
}

/** Why a split can't be shown on the profile yet, or null. */
export function shareSplitError(routine: Routine): string | null {
  return !routine.shared &&
    routine.days.some((day) => day.workout_type_id !== null && !day.movements.length)
    ? 'Add an exercise to each workout day in Edit split, then try again.'
    : null;
}

/** The first reason an edited split can't be saved, or null. */
export function routineSaveError(routine: Routine, types: WorkoutType[]): string | null {
  if (!routine.name.trim()) return 'Enter a split name.';
  const workoutDays = routine.days.filter((item) => item.workout_type_id !== null);
  if (!workoutDays.length) return 'Include at least one workout day.';
  if (routine.shared && workoutDays.some((item) => item.movements.length === 0))
    return 'Add exercises to every workout day before sharing.';
  if (
    routine.days.some((item) =>
      item.movements.some((m) => m.sets.some((set) => (set.weight_kg ?? 0) > 10000)),
    )
  )
    return 'Starting weights must be no more than 10,000 kg.';
  if (
    routine.days.some(
      (item) => item.workout_type_id && types.find((t) => t.id === item.workout_type_id)?.archived,
    )
  )
    return 'Choose an active workout type for every workout day.';
  return null;
}

/** Why a workout type made from the split editor can't use this name, or null. */
export function splitTypeNameError(name: string, types: WorkoutType[]): string | null {
  return types.some((t) => t.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())
    ? 'That workout type already exists, including removed types.'
    : null;
}

export const canAddSplitDay = (days: RoutineDay[]) => days.length < MAX_SPLIT_DAYS;

/** Swaps a day with its neighbour earlier (-1) or later (1) in the cycle. */
export function moveSplitDay(days: RoutineDay[], index: number, direction: -1 | 1): RoutineDay[] {
  const next = [...days];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
}

/** A day with another workout type, or Rest (null), which plans no exercises. */
export function withSplitDayType(day: RoutineDay, type: WorkoutType | null): RoutineDay {
  return {
    ...day,
    workout_type_id: type?.id ?? null,
    workout_type: type,
    movements: type ? day.movements : [],
  };
}

export const emptyRoutineSet = (): RoutineSet => ({
  reps: null,
  weight_kg: null,
  duration_seconds: null,
  distance_km: null,
  // Left to last time's rest, else the default rest in Settings, when the workout starts.
  rest_seconds: null,
  set_type: 'normal',
});

/** A new planned exercise: three empty sets, or a 30 minute session for cardio. */
export function newRoutineMovement(exercise: Exercise): RoutineMovement {
  return {
    exercise_id: exercise.id,
    exercise,
    sets:
      exercise.kind === 'cardio'
        ? [{ ...emptyRoutineSet(), duration_seconds: 1800 }]
        : [emptyRoutineSet(), emptyRoutineSet(), emptyRoutineSet()],
  };
}

/** A planned cardio exercise's total minutes. */
export function plannedMinutes(movement: RoutineMovement): number {
  return Math.round(
    movement.sets.reduce((total, set) => total + (set.duration_seconds ?? 0), 0) / 60,
  );
}

/** At its smallest plan, the minus control removes the exercise instead. */
export function atPlannedMinimum(movement: RoutineMovement): boolean {
  return movement.exercise.kind === 'cardio'
    ? plannedMinutes(movement) <= CARDIO_STEP_MINUTES
    : movement.sets.length <= 1;
}

export function canPlanMore(movement: RoutineMovement): boolean {
  return movement.exercise.kind === 'cardio'
    ? plannedMinutes(movement) < MAX_PLANNED_MINUTES
    : movement.sets.length < MAX_PLANNED_SETS;
}

/** One fewer set (five fewer cardio minutes), or null to remove the exercise at its minimum. */
export function planFewer(movement: RoutineMovement): RoutineMovement | null {
  if (atPlannedMinimum(movement)) return null;
  if (movement.exercise.kind !== 'cardio') return { ...movement, sets: movement.sets.slice(0, -1) };
  return {
    ...movement,
    // One planned duration; earlier interval sets fold into it.
    sets: [
      {
        ...movement.sets[0],
        duration_seconds: (plannedMinutes(movement) - CARDIO_STEP_MINUTES) * 60,
      },
    ],
  };
}

/** One more set, copying the last one as a working set (five more cardio minutes). */
export function planMore(movement: RoutineMovement): RoutineMovement {
  return movement.exercise.kind === 'cardio'
    ? {
        ...movement,
        sets: [
          {
            ...movement.sets[0],
            duration_seconds: (plannedMinutes(movement) + CARDIO_STEP_MINUTES) * 60,
          },
        ],
      }
    : {
        ...movement,
        sets: [...movement.sets, { ...movement.sets.at(-1)!, set_type: 'normal' }],
      };
}

/** Plans another exercise in its place, keeping its sets when both are the same kind. */
export function swapPlannedExercise(
  movement: RoutineMovement,
  exercise: Exercise,
): RoutineMovement {
  return {
    ...movement,
    exercise_id: exercise.id,
    exercise,
    sets: exercise.kind === movement.exercise.kind ? movement.sets : [emptyRoutineSet()],
    rep_range: exercise.kind === 'cardio' ? null : movement.rep_range,
  };
}

/** Saved routines return no progress or skip, so the server is asked for them after use. */
export function needsSplitProgress(split: TrainingSplit): boolean {
  return (
    split.enabled && (followsWorkouts(split) ? split.next_step == null : split.shift === undefined)
  );
}

/**
 * The progress the server reports, taken only while the same schedule is still shown (another
 * split may have been used meanwhile).
 */
export function withSplitProgress(
  shown: TrainingSplit | null,
  fresh: TrainingSplit | null,
): TrainingSplit | null {
  return shown &&
    fresh &&
    fresh.routine_id === shown.routine_id &&
    fresh.start_date === shown.start_date
    ? {
        ...shown,
        next_step: fresh.next_step,
        rest_saved: fresh.rest_saved,
        next_date: fresh.next_date,
        shift: fresh.shift,
      }
    : shown;
}

/** The split that a saved routine with a schedule becomes, as the web shows it straight away. */
export function scheduledSplit(
  saved: Routine,
  schedule: Pick<TrainingSplit, 'start_date' | 'enabled' | 'progression'>,
): TrainingSplit {
  return {
    name: saved.name,
    routine_id: saved.id,
    ...schedule,
    steps: saved.days.map((day) => ({ workout_type_id: day.workout_type_id })),
  };
}

/** A preview day's label: its workout type, Rest, Not started, or Removed type. */
export function splitPreviewDayLabel(types: WorkoutType[], id: string | null | undefined): string {
  return id === null
    ? 'Rest'
    : id === undefined
      ? 'Not started'
      : (types.find((t) => t.id === id)?.name ?? 'Removed type');
}
