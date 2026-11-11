import { workingSets, workoutVolumeKg } from './trainingSummary';
import type {
  DashboardData,
  Exercise,
  HeatmapDay,
  TrackedMovement,
  TrackedWorkout,
  WeeklyDayBreakdown,
  WorkoutCategory,
  WorkoutType,
} from './types';
import type { PendingWorkoutSave } from './workoutDraft';
import { upsertWorkoutByRecency } from './workoutHistory';
import { isCompletedWorkingSet } from './workoutSets';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

/** A finished workout the server has not confirmed yet uses an id the server never issues. */
const PENDING_WORKOUT_ID_PREFIX = 'pending:';

export function isPendingWorkoutId(id: string): boolean {
  return id.startsWith(PENDING_WORKOUT_ID_PREFIX);
}

/** The id the preview of `saved` had: the resumed workout's own id, or its session's pending id. */
export function previewIdForSaved(saved: TrackedWorkout, resumedId: string | null): string | null {
  if (resumedId) return resumedId;
  return saved.client_session_id ? `${PENDING_WORKOUT_ID_PREFIX}${saved.client_session_id}` : null;
}

/**
 * The finished workout as History and Home show it before the server confirms the save, built
 * from the completion stored on this device. Null when an exercise is not in the loaded
 * catalogue, so a partial workout is never shown.
 */
export function pendingWorkoutPreview(
  completion: PendingWorkoutSave,
  exercises: Exercise[],
  workoutTypes: WorkoutType[],
): TrackedWorkout | null {
  const { payload } = completion;
  const byId = new Map<string, Exercise>();
  for (const exercise of exercises) {
    byId.set(exercise.id, exercise);
    for (const merged of exercise.merged_from_ids ?? [])
      if (!byId.has(merged)) byId.set(merged, exercise);
  }
  const id =
    completion.workoutId ??
    `${PENDING_WORKOUT_ID_PREFIX}${payload.client_session_id ?? completion.finishedAt}`;
  const movements: TrackedMovement[] = [];
  for (const [index, movement] of payload.movements.entries()) {
    const exercise = byId.get(movement.exercise_id);
    if (!exercise) return null;
    const movementId = `${id}:movement:${index}`;
    movements.push({
      id: movementId,
      order_index: index,
      notes: movement.notes,
      exercise,
      sets: movement.sets.map((item, setIndex) => ({
        id: `${movementId}:set:${setIndex}`,
        order_index: setIndex,
        machine_photo_id: item.machine_photo_id ?? null,
        reps: item.reps,
        weight_kg: item.weight_kg,
        rpe: item.rpe,
        rest_seconds: item.rest_seconds,
        duration_seconds: item.duration_seconds,
        distance_km: item.distance_km,
        calories_kcal: item.calories_kcal ?? null,
        average_heart_rate_bpm: item.average_heart_rate_bpm ?? null,
        incline_percent: item.incline_percent ?? null,
        speed_kph: item.speed_kph ?? null,
        bodyweight_kg: item.bodyweight_kg ?? null,
        percentile: item.percentile ?? null,
        warmup: item.warmup ?? false,
        set_type: item.set_type ?? 'normal',
        failed: item.failed ?? false,
        target_reps: item.target_reps ?? null,
        notes: item.notes,
        completed: item.completed,
      })),
      // Machine photos appear once the server returns the saved workout.
      machine_photos: [],
      machine_settings: movement.machine_settings ?? [],
      superset_group_id: movement.superset_key ?? null,
      superset_name: null,
    });
  }
  const finishedAt = new Date(completion.finishedAt).toISOString();
  return {
    id,
    client_session_id: payload.client_session_id ?? null,
    name: payload.name,
    workout_date: payload.workout_date,
    category: payload.category,
    workout_type_id: payload.workout_type_id ?? null,
    workout_type:
      workoutTypes.find((type) => type.is_custom && type.id === payload.workout_type_id) ?? null,
    notes: payload.notes,
    duration_minutes: payload.duration_minutes,
    start_time: payload.start_time,
    end_time: payload.end_time,
    is_sample: false,
    created_at: finishedAt,
    updated_at: finishedAt,
    movements,
  };
}

function alreadySaved(workouts: ReadonlyArray<TrackedWorkout>, preview: TrackedWorkout): boolean {
  // A save the server committed but whose answer was lost can already be in refreshed data.
  return Boolean(
    preview.client_session_id &&
    workouts.some((workout) => workout.client_session_id === preview.client_session_id),
  );
}

/** Loaded history with the finished workout in place, newest first. */
export function workoutsWithPreview(
  workouts: TrackedWorkout[],
  preview: TrackedWorkout,
): TrackedWorkout[] {
  if (alreadySaved(workouts, preview)) return workouts;
  const existing = workouts.find((workout) => workout.id === preview.id);
  return upsertWorkoutByRecency(
    workouts,
    existing
      ? {
          ...preview,
          created_at: existing.created_at,
          is_sample: existing.is_sample,
          movements: preview.movements.map((movement) => ({
            ...movement,
            machine_photos:
              existing.movements.find((item) => item.exercise.id === movement.exercise.id)
                ?.machine_photos ?? [],
          })),
        }
      : preview,
  );
}

/** The backend's day colours: one strength type (Full body when mixed) plus Cardio. */
function displayCategories(workout: TrackedWorkout): WorkoutCategory[] {
  const movementCategories = new Set(
    workout.movements.map((movement) => movement.exercise.category),
  );
  const cardioMovements = movementCategories.delete('cardio');
  const hasCardio = cardioMovements || (!movementCategories.size && workout.category === 'cardio');
  const strength = movementCategories.size
    ? workout.category === 'cardio'
      ? movementCategories.size === 1
        ? [...movementCategories][0]
        : 'full_body'
      : workout.category
    : workout.category === 'cardio'
      ? null
      : workout.category;
  return [...(strength ? [strength] : []), ...(hasCardio ? (['cardio'] as const) : [])];
}

function mergeCategories(existing: WorkoutCategory[], added: WorkoutCategory[]): WorkoutCategory[] {
  const strength = [...new Set([...existing, ...added].filter((item) => item !== 'cardio'))];
  const hasCardio = existing.includes('cardio') || added.includes('cardio');
  return [
    ...(strength.length > 1 ? (['full_body'] as const) : strength),
    ...(hasCardio ? (['cardio'] as const) : []),
  ];
}

function displayTypes(workout: TrackedWorkout, types: WorkoutType[]): WorkoutType[] {
  const builtIn = (id: string) =>
    types.find((type) => !type.is_custom && type.id === id) ??
    DEFAULT_WORKOUT_TYPES.find((type) => type.id === id)!;
  if (workout.workout_type)
    return [
      workout.workout_type,
      ...(workout.movements.some((movement) => movement.exercise.kind === 'cardio')
        ? [builtIn('cardio')]
        : []),
    ];
  return displayCategories(workout).map(builtIn);
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function calendarDay(
  current: HeatmapDay | undefined,
  workout: TrackedWorkout,
  types: WorkoutType[],
): HeatmapDay {
  const added = displayTypes(workout, types);
  const entry: HeatmapDay['workouts'][number] = {
    id: workout.id,
    name: workout.name,
    category: workout.category,
    workout_type_id: workout.workout_type_id ?? null,
    workout_type: workout.workout_type ?? null,
    duration_minutes: workout.duration_minutes,
    exercises: workout.movements
      .map((movement) => {
        const sets = movement.sets.filter(isCompletedWorkingSet);
        return {
          exercise_name: movement.exercise.name,
          set_count: sets.length,
          bodyweight_kg: sets.find((item) => item.bodyweight_kg !== null)?.bodyweight_kg ?? null,
        };
      })
      .filter((exercise) => exercise.set_count > 0),
  };
  const setCount = workingSets(workout).length;
  if (!current)
    return {
      workout_date: workout.workout_date,
      categories: displayCategories(workout),
      workout_types: added,
      workout_count: 1,
      set_count: setCount,
      workouts: [entry],
    };
  return {
    ...current,
    categories: mergeCategories(current.categories, displayCategories(workout)),
    workout_types: current.workout_types && [
      ...current.workout_types,
      ...added.filter((type) => !current.workout_types!.some((item) => item.id === type.id)),
    ],
    workout_count: current.workout_count + 1,
    set_count: current.set_count + setCount,
    workouts: [...current.workouts, entry],
  };
}

function weekDay(
  current: WeeklyDayBreakdown | undefined,
  workout: TrackedWorkout,
): WeeklyDayBreakdown {
  const exercises = [...(current?.exercises ?? [])];
  for (const movement of workout.movements) {
    const sets = movement.sets.filter(isCompletedWorkingSet);
    if (!sets.length) continue;
    const volume = sets.reduce(
      (total, item) => total + (item.weight_kg ?? 0) * (item.reps ?? 0),
      0,
    );
    const index = exercises.findIndex((item) => item.exercise_id === movement.exercise.id);
    if (index >= 0)
      exercises[index] = {
        ...exercises[index],
        set_count: exercises[index].set_count + sets.length,
        volume_kg: round1(exercises[index].volume_kg + volume),
      };
    else
      exercises.push({
        exercise_id: movement.exercise.id,
        exercise_name: movement.exercise.name,
        muscle_group: movement.exercise.muscle_group,
        category: movement.exercise.category,
        set_count: sets.length,
        volume_kg: round1(volume),
      });
  }
  exercises.sort(
    (left, right) =>
      left.muscle_group.localeCompare(right.muscle_group, undefined, { sensitivity: 'base' }) ||
      left.exercise_name.localeCompare(right.exercise_name, undefined, { sensitivity: 'base' }),
  );
  return {
    workout_date: workout.workout_date,
    workout_count: (current?.workout_count ?? 0) + 1,
    total_sets: (current?.total_sets ?? 0) + workingSets(workout).length,
    volume_kg: round1((current?.volume_kg ?? 0) + workoutVolumeKg(workout)),
    workout_names: [...(current?.workout_names ?? []), workout.name],
    categories: current
      ? mergeCategories(current.categories, displayCategories(workout))
      : displayCategories(workout),
    exercises,
  };
}

/** Puts `day` in place of the same date, or at the newest end of a list ordered either way. */
function placeDay<T extends { workout_date: string }>(days: T[], day: T): T[] {
  const index = days.findIndex((item) => item.workout_date === day.workout_date);
  if (index >= 0) return days.map((item, position) => (position === index ? day : item));
  const newestFirst = days.length > 1 && days[0].workout_date > days[days.length - 1].workout_date;
  const ordered = [...days, day].sort((left, right) =>
    left.workout_date.localeCompare(right.workout_date),
  );
  return newestFirst ? ordered.reverse() : ordered;
}

/**
 * Home's figures with a newly finished workout counted on this device, until the server's
 * dashboard replaces them: this week's workouts, sets and volume, the week's days, the streak,
 * the calendar day, recent workouts and history totals. Cardio, recommendations and records stay
 * as the server last calculated them. A resumed workout (an update) only replaces its own copy.
 */
export function dashboardWithPreview(
  dashboard: DashboardData,
  preview: TrackedWorkout,
  workoutTypes: WorkoutType[],
  today: string,
  isNew: boolean,
): DashboardData {
  // Dashboards cached by earlier releases can lack newer lists.
  const recent = dashboard.recent_workouts ?? [];
  const heatmap = dashboard.heatmap ?? [];
  const weeklyDays = dashboard.weekly_days ?? [];
  if (alreadySaved(recent, preview)) return dashboard;
  const recentWorkouts = (
    isNew || recent.some((workout) => workout.id === preview.id)
      ? upsertWorkoutByRecency(recent, preview)
      : recent
  ).slice(0, Math.max(5, recent.length));
  if (!isNew) return { ...dashboard, recent_workouts: recentWorkouts };

  const date = preview.workout_date;
  const weekStart = dashboard.weekly_sets?.week_start;
  const thisWeek = Boolean(weekStart && weekStart <= date && date <= today);
  const sets = workingSets(preview).length;
  const hadWorkoutThatDay = heatmap.some(
    (day) => day.workout_date === date && day.workout_count > 0,
  );
  const history = dashboard.history;
  return {
    ...dashboard,
    ...(thisWeek && {
      workouts_this_week: (dashboard.workouts_this_week ?? 0) + 1,
      sets_this_week: (dashboard.sets_this_week ?? 0) + sets,
      volume_this_week_kg: round1((dashboard.volume_this_week_kg ?? 0) + workoutVolumeKg(preview)),
      weekly_days: placeDay(
        weeklyDays,
        weekDay(
          weeklyDays.find((day) => day.workout_date === date),
          preview,
        ),
      ),
    }),
    // A first workout today extends a streak that reached yesterday, or starts one.
    current_streak:
      date === today && !hadWorkoutThatDay
        ? (dashboard.current_streak ?? 0) + 1
        : dashboard.current_streak,
    heatmap: placeDay(
      heatmap,
      calendarDay(
        heatmap.find((day) => day.workout_date === date),
        preview,
        workoutTypes,
      ),
    ),
    recent_workouts: recentWorkouts,
    history: history && {
      ...history,
      total_workouts: history.total_workouts + 1,
      first_workout_date:
        history.first_workout_date && history.first_workout_date < date
          ? history.first_workout_date
          : date,
      last_workout_date:
        history.last_workout_date && history.last_workout_date > date
          ? history.last_workout_date
          : date,
    },
  };
}
