import { formatWeight, formatWeightNumber, weightFromKg, type WeightUnit } from './weightUnits';
import type {
  Exercise,
  PersonalRecord,
  RoutineSet,
  TrackedSet,
  TrackedWorkout,
  WorkoutCategory,
} from './types';
import { isCompletedWorkingSet } from './workoutSets';
import { mixedWorkoutName } from './workoutCategory';

const DAY_MS = 86_400_000;

export const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  upper: 'Upper body',
  lower: 'Lower body',
  push: 'Push',
  pull: 'Pull',
  full_body: 'Full body',
  cardio: 'Cardio',
  other: 'Other',
};

/** Parses a YYYY-MM-DD string as a local calendar day (noon avoids DST edges). */
export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function isoLocalDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`;
}

export function addDays(value: string, days: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return isoLocalDate(date);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / DAY_MS);
}

/** Start of the week containing `value`, where `weekStartDay` uses Date#getDay numbering. */
export function weekStartFor(value: string, weekStartDay: number): string {
  const offset = (parseLocalDate(value).getDay() - weekStartDay + 7) % 7;
  return addDays(value, -offset);
}

/** The dashboard reports the current week's first day; reuse it so every total agrees. */
export function weekStartDayFrom(weekStart: string | null | undefined): number {
  return weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)
    ? parseLocalDate(weekStart).getDay()
    : 1;
}

export function workingSets(workout: TrackedWorkout): TrackedSet[] {
  return workout.movements.flatMap((movement) => movement.sets.filter(isCompletedWorkingSet));
}

export function workoutVolumeKg(workout: TrackedWorkout): number {
  return workingSets(workout).reduce(
    (total, item) => total + (item.weight_kg ?? 0) * (item.reps ?? 0),
    0,
  );
}

/**
 * Cardio sessions in a workout: one per cardio movement with at least a minute of completed
 * time, mirroring how the backend writes the cardio-session ledger (so cardio done after
 * strength counts too).
 */
export function cardioSessionCount(workout: TrackedWorkout): number {
  return workout.movements.filter(
    (movement) =>
      movement.exercise.kind === 'cardio' &&
      movement.sets.reduce(
        (seconds, item) => seconds + (item.completed ? Math.max(item.duration_seconds ?? 0, 0) : 0),
        0,
      ) >= 60,
  ).length;
}

export interface WeeklyTotals {
  weekStart: string;
  workouts: number;
  cardioSessions: number;
  sets: number;
  volumeKg: number;
}

/** Totals for the last `weeks` weeks, oldest first, ending with the week containing `today`. */
export function weeklyTrainingTotals(
  workouts: TrackedWorkout[],
  today: string,
  weekStartDay: number,
  weeks = 12,
): WeeklyTotals[] {
  const currentWeek = weekStartFor(today, weekStartDay);
  const buckets = Array.from({ length: weeks }, (_, index) => ({
    weekStart: addDays(currentWeek, (index - weeks + 1) * 7),
    workouts: 0,
    cardioSessions: 0,
    sets: 0,
    volumeKg: 0,
  }));
  const byStart = new Map(buckets.map((bucket) => [bucket.weekStart, bucket]));
  for (const workout of workouts) {
    if (workout.workout_date > today) continue;
    const bucket = byStart.get(weekStartFor(workout.workout_date, weekStartDay));
    if (!bucket) continue;
    bucket.workouts += 1;
    bucket.cardioSessions += cardioSessionCount(workout);
    bucket.sets += workingSets(workout).length;
    bucket.volumeKg += workoutVolumeKg(workout);
  }
  return buckets;
}

export function averageOf(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

/** Average body weight per week for the last `weeks` weeks, oldest first; null where nothing was logged. */
export function weeklyBodyweightAverages(
  measurements: Array<{ measurement_date: string; weight_kg: number }>,
  today: string,
  weekStartDay: number,
  weeks = 12,
): Array<number | null> {
  const currentWeek = weekStartFor(today, weekStartDay);
  const firstWeek = addDays(currentWeek, (1 - weeks) * 7);
  const buckets = new Map<string, number[]>();
  for (const measurement of measurements) {
    if (measurement.measurement_date > today || measurement.measurement_date < firstWeek) continue;
    const week = weekStartFor(measurement.measurement_date, weekStartDay);
    buckets.set(week, [...(buckets.get(week) ?? []), measurement.weight_kg]);
  }
  return Array.from({ length: weeks }, (_, index) =>
    averageOf(buckets.get(addDays(firstWeek, index * 7)) ?? []),
  );
}

export interface TrainingDay {
  date: string;
  sets: number;
  workouts: number;
  categories: WorkoutCategory[];
  future: boolean;
}

/** A week-per-column grid (oldest week first) of working sets per day for consistency stats. */
export function trainingDayGrid(
  workouts: TrackedWorkout[],
  today: string,
  weekStartDay: number,
  weeks = 12,
): TrainingDay[][] {
  const firstDay = addDays(weekStartFor(today, weekStartDay), -(weeks - 1) * 7);
  const byDate = new Map<string, TrainingDay>();
  for (let offset = 0; offset < weeks * 7; offset += 1) {
    const date = addDays(firstDay, offset);
    byDate.set(date, { date, sets: 0, workouts: 0, categories: [], future: date > today });
  }
  for (const workout of workouts) {
    const day = byDate.get(workout.workout_date);
    if (!day || day.future) continue;
    day.workouts += 1;
    day.sets += workingSets(workout).length;
    if (!day.categories.includes(workout.category)) day.categories.push(workout.category);
  }
  const days = [...byDate.values()];
  return Array.from({ length: weeks }, (_, week) => days.slice(week * 7, week * 7 + 7));
}

/** Evenly stepped axis ticks on 1/2/5 multiples that cover [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.05, 1);
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(count, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * magnitude;
  const first = Math.floor(min / step) * step;
  const last = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= last + step / 1e6; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

/** Imported workouts are named “Imported workout · YYYY-MM-DD”; their type reads better. */
export function workoutDisplayName(
  workout: Pick<TrackedWorkout, 'name' | 'category' | 'workout_type'> &
    Partial<Pick<TrackedWorkout, 'movements'>>,
): string {
  const name = workout.name.trim();
  const base =
    !name || /^Imported workout\b/i.test(name)
      ? (workout.workout_type?.name ?? CATEGORY_LABELS[workout.category])
      : name;
  return mixedWorkoutName(base, workout.movements?.map((movement) => movement.exercise) ?? []);
}

export function formatVolume(kg: number, unit: WeightUnit = 'kg'): string {
  if (unit === 'lb') return `${Math.round(weightFromKg(kg, unit)).toLocaleString('en-GB')} lb`;
  if (kg >= 10_000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg).toLocaleString('en-GB')} kg`;
}

export function formatKg(value: number): string {
  return `${Number(value.toFixed(1)).toLocaleString('en-GB')} kg`;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** “Mon 5 Oct” */
export function shortDate(value: string): string {
  const date = parseLocalDate(value);
  return `${SHORT_DAYS[date.getDay()]} ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

/** “5 Oct” */
export function dayMonth(value: string): string {
  const date = parseLocalDate(value);
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

/** Heaviest completed working set, preferring more reps at equal weight. */
export function topWorkingSet(sets: TrackedSet[]): TrackedSet | null {
  return sets.filter(isCompletedWorkingSet).reduce<TrackedSet | null>((best, item) => {
    if (item.weight_kg === null) return best;
    if (!best || best.weight_kg === null) return item;
    if (item.weight_kg > best.weight_kg) return item;
    if (item.weight_kg === best.weight_kg && (item.reps ?? 0) > (best.reps ?? 0)) return item;
    return best;
  }, null);
}

export function setLabel(
  item: Pick<TrackedSet, 'weight_kg' | 'reps'>,
  unit: WeightUnit = 'kg',
): string {
  return `${formatWeight(item.weight_kg ?? 0, unit)} × ${item.reps ?? '–'}`;
}

export interface SessionTemplateExercise {
  exercise: Exercise;
  plannedSets?: RoutineSet[];
  topSet: TrackedSet | null;
  /** “157.5 kg × 5” for strength, “30 min · 4.8 km” for cardio. */
  summary: string;
}

function cardioSummary(sets: TrackedSet[]): string {
  const done = sets.filter((item) => item.completed);
  const seconds = done.reduce((total, item) => total + (item.duration_seconds ?? 0), 0);
  const distance = done.reduce((total, item) => total + (item.distance_km ?? 0), 0);
  return (
    [
      seconds ? `${Math.round(seconds / 60)} min` : null,
      distance ? `${Number(distance.toFixed(1))} km` : null,
    ]
      .filter(Boolean)
      .join(' · ') || '–'
  );
}

export interface SessionTemplate {
  category: WorkoutCategory;
  sourceWorkout: TrackedWorkout;
  exercises: SessionTemplateExercise[];
}

/** The newest saved workout of a type, used to pre-fill the recommended next session. */
export function sessionTemplateFor(
  workouts: TrackedWorkout[],
  category: WorkoutCategory,
  today: string,
  unit: WeightUnit = 'kg',
  workoutTypeId: string | null = null,
): SessionTemplate | null {
  const source = workouts
    .filter(
      (workout) =>
        workout.category === category &&
        (workout.workout_type_id ?? null) === workoutTypeId &&
        workout.workout_date <= today &&
        workout.movements.length > 0,
    )
    .sort(
      (left, right) =>
        right.workout_date.localeCompare(left.workout_date) ||
        workingSets(right).length - workingSets(left).length ||
        right.created_at.localeCompare(left.created_at),
    )[0];
  if (!source) return null;
  return {
    category,
    sourceWorkout: source,
    exercises: [...source.movements]
      .sort((left, right) => left.order_index - right.order_index)
      .map((movement) => {
        const topSet = topWorkingSet(movement.sets);
        return {
          exercise: movement.exercise,
          topSet,
          summary:
            movement.exercise.kind === 'cardio'
              ? cardioSummary(movement.sets)
              : topSet
                ? setLabel(topSet, unit)
                : '–',
        };
      }),
  };
}

export interface WorkoutWeekGroup {
  weekStart: string;
  workouts: TrackedWorkout[];
  sets: number;
  volumeKg: number;
}

export function groupWorkoutsByWeek(
  workouts: TrackedWorkout[],
  weekStartDay: number,
): WorkoutWeekGroup[] {
  const groups: WorkoutWeekGroup[] = [];
  for (const workout of workouts) {
    const weekStart = weekStartFor(workout.workout_date, weekStartDay);
    let group = groups.at(-1);
    if (!group || group.weekStart !== weekStart) {
      group = { weekStart, workouts: [], sets: 0, volumeKg: 0 };
      groups.push(group);
    }
    group.workouts.push(workout);
    group.sets += workingSets(workout).length;
    group.volumeKg += workoutVolumeKg(workout);
  }
  return groups;
}

export function weekGroupLabel(weekStart: string, today: string, weekStartDay: number): string {
  const current = weekStartFor(today, weekStartDay);
  if (weekStart === current) return 'This week';
  if (weekStart === addDays(current, -7)) return 'Last week';
  const end = addDays(weekStart, 6);
  const sameMonth = parseLocalDate(weekStart).getMonth() === parseLocalDate(end).getMonth();
  return sameMonth
    ? `${parseLocalDate(weekStart).getDate()}–${dayMonth(end)}`
    : `${dayMonth(weekStart)} – ${dayMonth(end)}`;
}

/** Strength records worth surfacing on Today, newest first. */
export function recentStrengthRecords(records: PersonalRecord[], limit = 3): PersonalRecord[] {
  const seen = new Set<string>();
  return records
    .filter((record) => record.record_type === 'reps_at_weight' || record.record_type === 'weight')
    .filter((record) => record.value > 0)
    .sort(
      (left, right) =>
        right.achieved_date.localeCompare(left.achieved_date) ||
        (left.record_type === 'weight' ? -1 : 1) - (right.record_type === 'weight' ? -1 : 1) ||
        right.value - left.value,
    )
    .filter((record) => {
      // One row per exercise and record type: the best of a day's repeated records.
      const key = `${record.exercise_id}:${record.record_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function recordCountsByWorkout(records: PersonalRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.record_type !== 'reps_at_weight' && record.record_type !== 'weight') continue;
    counts.set(record.workout_id, (counts.get(record.workout_id) ?? 0) + 1);
  }
  return counts;
}

/** The strength exercise trained in the most sessions recently, a sensible default to chart. */
export function mostTrainedExerciseId(
  workouts: TrackedWorkout[],
  today: string,
  days = 90,
): string | null {
  const since = addDays(today, -days);
  const counts = new Map<string, { count: number; latest: string }>();
  for (const workout of workouts) {
    if (workout.workout_date < since || workout.workout_date > today) continue;
    for (const movement of workout.movements) {
      if (movement.exercise.kind !== 'strength' || !movement.sets.some(isCompletedWorkingSet))
        continue;
      const entry = counts.get(movement.exercise.id) ?? { count: 0, latest: '' };
      entry.count += 1;
      if (workout.workout_date > entry.latest) entry.latest = workout.workout_date;
      counts.set(movement.exercise.id, entry);
    }
  }
  let best: string | null = null;
  let bestEntry: { count: number; latest: string } | null = null;
  for (const [id, entry] of counts) {
    if (
      !bestEntry ||
      entry.count > bestEntry.count ||
      (entry.count === bestEntry.count && entry.latest > bestEntry.latest)
    ) {
      best = id;
      bestEntry = entry;
    }
  }
  return best;
}

/** One point per Monday-start week holding that week's best value (light days stop reading as regressions). */
export function weeklyBestPoints<T extends { workout_date: string }>(
  points: T[],
  value: (point: T) => number,
): T[] {
  const byWeek = new Map<string, T>();
  for (const point of points) {
    const week = weekStartFor(point.workout_date, 1);
    const current = byWeek.get(week);
    if (!current || value(point) > value(current)) byWeek.set(week, point);
  }
  return [...byWeek.values()].sort((left, right) =>
    left.workout_date.localeCompare(right.workout_date),
  );
}

/** “157.5×5 ×2, 157.5×4”: consecutive identical working sets collapsed. */
export function compactSetSummary(sets: TrackedSet[], unit: WeightUnit = 'kg'): string {
  const parts: Array<{ label: string; count: number }> = [];
  for (const item of sets.filter(isCompletedWorkingSet)) {
    if (item.weight_kg === null && item.reps === null) continue;
    const label =
      item.weight_kg === null
        ? `${item.reps} reps`
        : `${formatWeightNumber(item.weight_kg, unit)}×${item.reps ?? '–'}`;
    const last = parts.at(-1);
    if (last && last.label === label) last.count += 1;
    else parts.push({ label, count: 1 });
  }
  return parts
    .map((part) => (part.count > 1 ? `${part.label} ×${part.count}` : part.label))
    .join(', ');
}
