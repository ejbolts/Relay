import { muscleSetGoal, type MuscleSetGoals } from './muscleSetGoals';
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

/** Head-to-toe order, so rows stay put while sets change. Unlisted muscles follow A–Z. */
const MUSCLE_ORDER = [
  'Neck flexors',
  'Lateral neck flexors',
  'Neck extensors',
  'Chest',
  'Pectorals',
  'Shoulders',
  'Front delts',
  'Side delts',
  'Rear Delts',
  'Rear deltoids',
  'Upper traps',
  'Back',
  'Lats',
  'Mid / Upper Back',
  'Lower Back',
  'Spinal erectors',
  'Biceps',
  'Triceps',
  'Forearms',
  'Abs',
  'Core',
  'Hip flexors',
  'Glutes',
  'Posterior chain',
  'Quads',
  'Quadriceps',
  'Hamstrings',
  'Adductors',
  'Calves',
];
const muscleRank = (muscle: string) => {
  const index = MUSCLE_ORDER.indexOf(muscle);
  return index < 0 ? MUSCLE_ORDER.length : index;
};

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

/** Planned cardio minutes for one session of a split day. */
export function dayCardioMinutes(day: RoutineDay): number {
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
      .sort(
        (left, right) =>
          muscleRank(left.muscle) - muscleRank(right.muscle) ||
          left.muscle.localeCompare(right.muscle),
      ),
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

/** An exercise's credited muscles as a short line, such as "Chest · Triceps ½". */
export function exerciseMuscles(exercise: Exercise) {
  if (exercise.kind === 'cardio') return 'Cardio';
  return exerciseSetCredits(exercise)
    .map(({ muscle, sets }) => (sets < 1 ? `${muscle} ½` : muscle))
    .join(' · ');
}

/** The selection key for the cardio row of the weekly volume chart. */
export const CARDIO_ROW = '__cardio';

export const TARGET_MARKS: Record<TargetStatus, string> = { met: '✓', close: '~', under: '!' };
export const TARGET_LABELS: Record<TargetStatus, string> = {
  met: 'on target',
  close: 'nearly there',
  under: 'under target',
};

/** One row of a split's weekly volume: a muscle's sets, or planned cardio minutes. */
export interface VolumeRow {
  key: string;
  name: string;
  value: number;
  goal: number | null;
  unit: 'sets' | 'min';
  status: TargetStatus | null;
}

/** Sets keep one decimal place for part credits; cardio shows whole minutes. */
export const volumeRowValue = (row: VolumeRow) =>
  row.unit === 'min' ? Math.round(row.value).toLocaleString() : formatVolume(row.value);

/** A row as one sentence, for screen readers. */
export function describeVolumeRow(row: VolumeRow) {
  const unit = row.unit === 'min' ? 'minutes' : 'sets';
  return row.goal == null
    ? `${row.name}: ${volumeRowValue(row)} ${unit} a week`
    : `${row.name}: ${volumeRowValue(row)} of ${row.goal} ${unit} a week, ${TARGET_LABELS[row.status!]}`;
}

/**
 * A split's planned weekly volume against the account's goals: a row per muscle, the cardio row
 * when there is a cardio goal or planned cardio, and how many goals the plan meets.
 */
export function splitVolumeRows(
  days: RoutineDay[],
  muscleGoal: number,
  muscleGoals: MuscleSetGoals | undefined,
  cardioGoal: number | null,
) {
  const volume = plannedWeeklyVolume(days);
  const rows: VolumeRow[] = volume.muscles.map(({ muscle, sets }) => ({
    key: muscle,
    name: muscle,
    value: sets,
    goal: muscleSetGoal(muscle, muscleGoal, muscleGoals),
    unit: 'sets',
    status: targetStatus(sets, muscleSetGoal(muscle, muscleGoal, muscleGoals)),
  }));
  const cardio: VolumeRow | null =
    cardioGoal || volume.cardioMinutes > 0
      ? {
          key: CARDIO_ROW,
          name: 'Cardio',
          value: volume.cardioMinutes,
          goal: cardioGoal || null,
          unit: 'min',
          status: cardioGoal ? targetStatus(volume.cardioMinutes, cardioGoal) : null,
        }
      : null;
  const goals = [...rows, ...(cardio ? [cardio] : [])].filter((row) => row.status);
  return {
    cycleDays: volume.cycleDays,
    rows,
    cardio,
    goals: goals.length,
    met: goals.filter((row) => row.status === 'met').length,
  };
}
