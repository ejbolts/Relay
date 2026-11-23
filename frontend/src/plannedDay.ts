import { splitPreview, type SplitPreviewDay } from './trainingSplit';
import { daysBetween } from './trainingSummary';
import type { Routine, RoutineDay, TrainingSplit, WorkoutCategory, WorkoutType } from './types';

/** What the split plans on a day from today on. */
export type PlannedDay =
  /** `type` starts the workout; a mixed day's other types follow in `extraTypes`. */
  | { kind: 'training'; date: string; step: number; type: WorkoutType; extraTypes: WorkoutType[] }
  | { kind: 'rest'; date: string }
  /** The split names a workout type that was removed or archived. */
  | { kind: 'update'; date: string }
  /** No split, or a day a workout-following split has not reached yet. */
  | { kind: 'none'; date: string };

/** How far ahead a rest day looks for the next training day. */
const NEXT_TRAINING_LOOKAHEAD = 28;

function planFor(day: SplitPreviewDay, types: WorkoutType[]): PlannedDay {
  if (day.typeId === null) return { kind: 'rest', date: day.date };
  if (day.typeId === undefined || day.step === undefined) return { kind: 'none', date: day.date };
  const planned = (day.typeIds.length ? day.typeIds : [day.typeId]).map((id) =>
    types.find((item) => item.id === id),
  );
  if (planned.some((type) => !type || type.archived)) return { kind: 'update', date: day.date };
  const [type, ...extraTypes] = planned as WorkoutType[];
  return { kind: 'training', date: day.date, step: day.step, type, extraTypes };
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
  return planFor(preview.at(-1) ?? { date, typeId: undefined, typeIds: [] }, types);
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
