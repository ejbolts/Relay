import { prettyDate } from './appShared';
import { splitPreview } from './trainingSplit';
import { daysBetween, parseLocalDate, type SessionTemplate } from './trainingSummary';
import type {
  Routine,
  RoutineDay,
  RoutineMovement,
  TrackedWorkout,
  TrainingSplit,
  WorkoutCategory,
  WorkoutType,
} from './types';
import { splitDayTemplate } from './upNextSession';
import type { WeightUnit } from './weightUnits';

/** What the split plans on a day from today on. */
export type PlannedDay =
  | { kind: 'training'; date: string; step: number; type: WorkoutType }
  | { kind: 'rest'; date: string }
  /** The split names a workout type that was removed or archived. */
  | { kind: 'update'; date: string }
  /** No split, or a day a workout-following split has not reached yet. */
  | { kind: 'none'; date: string };

/** How far ahead a rest day looks for the next training day. */
const NEXT_TRAINING_LOOKAHEAD = 28;

function planFor(
  day: { date: string; step?: number; typeId: string | null | undefined },
  types: WorkoutType[],
): PlannedDay {
  if (day.typeId === null) return { kind: 'rest', date: day.date };
  if (day.typeId === undefined || day.step === undefined) return { kind: 'none', date: day.date };
  const type = types.find((item) => item.id === day.typeId);
  if (!type || type.archived) return { kind: 'update', date: day.date };
  return { kind: 'training', date: day.date, step: day.step, type };
}

/**
 * The split's plan for `date`, counted from `today` as if each earlier day is done as planned,
 * the same way the calendar outlines planned days.
 */
export function plannedDayOn(
  split: TrainingSplit | null | undefined,
  date: string,
  today: string,
  types: WorkoutType[],
): PlannedDay {
  if (!split?.enabled || !split.steps.length || date < today) return { kind: 'none', date };
  const preview = splitPreview(split, today, daysBetween(today, date) + 1);
  return planFor(preview.at(-1) ?? { date, typeId: undefined }, types);
}

/** The first training day from `from` on, for starting it early from a rest day. */
export function nextTrainingDay(
  split: TrainingSplit | null | undefined,
  from: string,
  types: WorkoutType[],
): Extract<PlannedDay, { kind: 'training' }> | null {
  if (!split?.enabled || !split.steps.length) return null;
  for (const day of splitPreview(split, from, NEXT_TRAINING_LOOKAHEAD)) {
    const plan = planFor(day, types);
    if (plan.kind === 'training') return plan;
  }
  return null;
}

/** The routine day behind a split step, when the routine still plans that type there. */
export function routineDayFor(
  routine: Routine | null | undefined,
  step: number,
  type: WorkoutType,
): RoutineDay | null {
  const day = routine?.days[step];
  if (!day || day.workout_type_id !== type.id) return null;
  return day.workout_type ? day : { ...day, workout_type: type };
}

/** Built-in types are their own category; custom ones log as Other, as the server does. */
export function categoryForType(type: WorkoutType): WorkoutCategory {
  return (type.is_custom ? 'other' : type.id) as WorkoutCategory;
}

/** A split day to start, pre-filled the way Up next starts one. */
export interface PlannedStart {
  template: SessionTemplate | null;
  category: WorkoutCategory;
  type: WorkoutType;
}

/**
 * What tapping a calendar day opens: a logged day its workouts; today with a split, and every
 * later day, the plan (started today); and a past empty day, or today without a split, the
 * question whether to log a workout on that date.
 */
export function calendarDayTarget(
  date: string,
  today: string,
  logged: boolean,
  splitEnabled: boolean,
): 'logged' | 'planned' | 'create' {
  if (logged) return 'logged';
  if (date > today || (date === today && splitEnabled)) return 'planned';
  return 'create';
}

/** The planned-day sheet's title. */
export function plannedDayTitle(plan: PlannedDay): string {
  switch (plan.kind) {
    case 'training':
      return `${plan.type.name} day`;
    case 'rest':
      return 'Rest day';
    case 'update':
      return 'Update your split';
    default:
      return 'Nothing planned';
  }
}

/** The line above the title: Today, or the day's long date. */
export function plannedDayKicker(date: string, today: string): string {
  return date === today
    ? 'Today'
    : parseLocalDate(date).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
}

/** The training day the sheet starts: the day's own, or from today's rest day the next one. */
export function plannedStartPlan(
  plan: PlannedDay,
  split: TrainingSplit | null | undefined,
  today: string,
  types: WorkoutType[],
): Extract<PlannedDay, { kind: 'training' }> | null {
  if (plan.kind === 'training') return plan;
  return plan.date === today ? nextTrainingDay(split, today, types) : null;
}

/**
 * The planned day as a workout to start: its routine day when the split's routine still plans
 * that type there, else the type's saved exercises or its last session.
 */
export function plannedDayStart({
  startPlan,
  routine,
  workouts,
  savedExercises,
  today,
  weightUnit,
}: {
  startPlan: Extract<PlannedDay, { kind: 'training' }>;
  routine: Routine | null | undefined;
  workouts: TrackedWorkout[];
  savedExercises: Record<string, RoutineMovement[]>;
  today: string;
  weightUnit: WeightUnit;
}): PlannedStart {
  const { type, step } = startPlan;
  const category = categoryForType(type);
  return {
    category,
    type,
    template: splitDayTemplate({
      routineDay: routineDayFor(routine, step, type),
      type,
      category,
      name: `${type.name} workout`,
      workouts,
      savedExercises,
      today,
      weightUnit,
    }),
  };
}

/**
 * The sheet's buttons. Workouts always start today, so a later day never gets a workout dated
 * ahead: a later training day offers Start now, and only today offers an empty workout.
 */
export function plannedDayButtons({
  plan,
  startPlan,
  today,
  activeWorkout,
}: {
  plan: PlannedDay;
  startPlan: Extract<PlannedDay, { kind: 'training' }> | null;
  today: string;
  activeWorkout: boolean;
}): {
  resume: boolean;
  start: { label: string; accessibilityLabel: string } | null;
  empty: { label: string; compact: boolean } | null;
} {
  if (activeWorkout) return { resume: true, start: null, empty: null };
  const isToday = plan.date === today;
  const start =
    startPlan && (isToday || plan.kind === 'training')
      ? {
          label: isToday ? `Start ${startPlan.type.name}` : 'Start now',
          accessibilityLabel: isToday
            ? `Start ${startPlan.type.name}`
            : `Start ${startPlan.type.name} now`,
        }
      : null;
  const empty = isToday
    ? { label: startPlan ? 'Empty' : 'Start empty workout', compact: !!startPlan }
    : null;
  return { resume: false, start, empty };
}

/** Asks before starting a workout on an empty day; red when it would discard the live one. */
export function calendarCreatePrompt(workoutDate: string, activeWorkout: boolean) {
  return activeWorkout
    ? {
        title: 'Cancel your current workout?',
        message: `Creating a workout for ${prettyDate(workoutDate)} will discard your current unsaved workout.`,
        cancel: 'Keep current workout',
        confirm: 'Cancel & create new',
        destructive: true,
      }
    : {
        title: 'Create a new workout?',
        message: `Start a workout for ${prettyDate(workoutDate)}?`,
        cancel: 'Cancel',
        confirm: 'Create workout',
        destructive: false,
      };
}
