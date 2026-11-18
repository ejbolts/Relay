import type {
  ExerciseHistoryBaseline,
  TrackedWorkout,
  WorkoutSetInput,
  TrainingBlock,
  BodyMeasurement,
} from './types';
import type { WorkoutDraftMovement as DraftMovement } from './workoutMovements';
import { blockOn } from './trainingBlocks';
import { bodyweightOn, relativeStrength } from './relativeStrength';

// Compare canonical kilograms, independently of the preferred display unit.
// Four decimals absorb conversion noise without merging distinct plate weights.
export const prWeight = (weightKg: number) => Math.round(weightKg * 10_000) / 10_000;

export function isStrengthPrEligible(item: WorkoutSetInput): boolean {
  return (
    item.completed &&
    item.set_type !== 'warmup' &&
    !item.warmup &&
    item.weight_kg !== null &&
    Number.isFinite(item.weight_kg) &&
    item.weight_kg >= 0 &&
    item.reps !== null &&
    Number.isFinite(item.reps) &&
    item.reps > 0 &&
    (!item.failed || (item.target_reps != null && item.reps >= item.target_reps))
  );
}

export function calculateDraftPrs(
  movements: DraftMovement[],
  historicalWorkouts: TrackedWorkout[],
  excludedWorkoutId: string | null,
  workoutDate: string,
  /** History older than `historicalWorkouts`, condensed per exercise by the server. */
  olderHistory?: Map<string, ExerciseHistoryBaseline> | null,
  measurements: BodyMeasurement[] = [],
): Map<string, Map<string, string[]>> {
  type State = { weight: number; reps: Map<number, number>; relative: number };
  const states = new Map<string, State>();
  for (const [exerciseId, baseline] of olderHistory ?? []) {
    if (baseline.best_weight_kg === null) continue;
    states.set(exerciseId, {
      weight: prWeight(baseline.best_weight_kg),
      relative: baseline.best_relative_strength ?? -1,
      reps: new Map(baseline.reps_by_weight.map((item) => [prWeight(item.weight_kg), item.reps])),
    });
  }
  const excluded = historicalWorkouts.find((workout) => workout.id === excludedWorkoutId);
  const priorWorkouts = historicalWorkouts.filter(
    (workout) =>
      workout.id !== excludedWorkoutId &&
      (workout.workout_date < workoutDate ||
        (workout.workout_date === workoutDate &&
          (!excluded || workout.created_at < excluded.created_at))),
  );

  // History is the baseline: PR rows alone omit first attempts at each weight.
  for (const workout of priorWorkouts) {
    for (const movement of workout.movements) {
      if (movement.exercise.kind !== 'strength') continue;
      const state = states.get(movement.exercise.id) ?? {
        weight: -1,
        reps: new Map(),
        relative: -1,
      };
      for (const item of movement.sets) {
        if (!isStrengthPrEligible(item)) continue;
        const weight = prWeight(item.weight_kg!);
        state.weight = Math.max(state.weight, weight);
        state.reps.set(weight, Math.max(state.reps.get(weight) ?? 0, item.reps!));
        const ratio = relativeStrength(
          item.weight_kg,
          bodyweightOn(measurements, workout.workout_date, item.bodyweight_kg),
        );
        if (ratio !== null) state.relative = Math.max(state.relative, ratio);
      }
      states.set(movement.exercise.id, state);
    }
  }

  const result = new Map<string, Map<string, string[]>>();
  for (const movement of movements) {
    const state = states.get(movement.exercise.id) ?? { weight: -1, reps: new Map(), relative: -1 };
    const badges = new Map<string, string[]>();
    for (const item of movement.sets) {
      if (movement.exercise.kind !== 'strength' || !isStrengthPrEligible(item)) continue;
      const weight = prWeight(item.weight_kg!);
      const labels: string[] = [];
      if (state.weight >= 0 && weight > state.weight) labels.push('Weight PR');
      const previousReps = state.reps.get(weight);
      if (previousReps !== undefined && item.reps! > previousReps)
        labels.push('Volume PR for this weight');
      const ratio = relativeStrength(
        item.weight_kg,
        bodyweightOn(measurements, workoutDate, item.bodyweight_kg),
      );
      if (ratio !== null) {
        if (state.relative >= 0 && ratio > state.relative) labels.push('Relative strength PR');
        state.relative = Math.max(state.relative, ratio);
      }
      state.weight = Math.max(state.weight, weight);
      state.reps.set(weight, Math.max(previousReps ?? 0, item.reps!));
      if (labels.length) badges.set(item.key, labels);
    }
    states.set(movement.exercise.id, state);
    result.set(movement.key, badges);
  }
  return result;
}

export function calculateScopedDraftPrs(
  movements: DraftMovement[],
  historicalWorkouts: TrackedWorkout[],
  excludedWorkoutId: string | null,
  workoutDate: string,
  olderHistory: Map<string, ExerciseHistoryBaseline> | null | undefined,
  blocks: TrainingBlock[],
  measurements: BodyMeasurement[] = [],
) {
  const lifetime = calculateDraftPrs(
    movements,
    historicalWorkouts,
    excludedWorkoutId,
    workoutDate,
    olderHistory,
    measurements,
  );
  if (!blocks.length) return lifetime;
  const block = blockOn(blocks, workoutDate);
  const scopedOlder = new Map<string, ExerciseHistoryBaseline>();
  if (block)
    for (const [id, baseline] of olderHistory ?? []) {
      const best = baseline.block_bests?.find((item) => item.block_id === block.id);
      if (best) scopedOlder.set(id, { ...baseline, ...best });
    }
  const scoped = block
    ? calculateDraftPrs(
        movements,
        historicalWorkouts.filter(
          (workout) =>
            workout.workout_date >= block.start_date &&
            (!block.end_date || workout.workout_date < block.end_date),
        ),
        excludedWorkoutId,
        workoutDate,
        scopedOlder,
        measurements,
      )
    : new Map<string, Map<string, string[]>>();
  return new Map(
    movements.map((movement) => {
      const badges = new Map<string, string[]>();
      for (const item of movement.sets) {
        const all = lifetime.get(movement.key)?.get(item.key) ?? [];
        const current = scoped.get(movement.key)?.get(item.key) ?? [];
        const labels = [
          ...all.map((label) => `All-time ${label.charAt(0).toLowerCase()}${label.slice(1)}`),
          ...current
            .filter((label) => !all.includes(label))
            .map((label) => `Block ${label.charAt(0).toLowerCase()}${label.slice(1)}`),
        ];
        if (labels.length) badges.set(item.key, labels);
      }
      return [movement.key, badges];
    }),
  );
}
