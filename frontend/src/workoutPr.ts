import type {
  ExerciseHistoryBaseline,
  HistoryBest,
  TrackedWorkout,
  WorkoutSetInput,
  TrainingBlock,
  BodyMeasurement,
} from './types';
import type { WorkoutDraftMovement as DraftMovement } from './workoutMovements';
import { blockOn, freshStartOn } from './trainingBlocks';
import {
  addCardioSet,
  cardioBestsFrom,
  cardioHitLabel,
  isCardioRecordEligible,
  cardioSetSummary,
  paceDistances,
  type CardioBestsState,
} from './cardioRecords';
import { bodyweightContext, bodyweightOn, relativeStrength } from './relativeStrength';
import { formatWeight, type WeightUnit } from './weightUnits';

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
  type State = {
    weight: number;
    reps: Map<number, number>;
    relative: number;
    cardio: CardioBestsState;
  };
  const emptyState = (): State => ({
    weight: -1,
    reps: new Map(),
    relative: -1,
    cardio: cardioBestsFrom(null),
  });
  const states = new Map<string, State>();
  for (const [exerciseId, baseline] of olderHistory ?? []) {
    states.set(exerciseId, {
      weight: baseline.best_weight_kg === null ? -1 : prWeight(baseline.best_weight_kg),
      relative: baseline.best_relative_strength ?? -1,
      reps: new Map(baseline.reps_by_weight.map((item) => [prWeight(item.weight_kg), item.reps])),
      cardio: cardioBestsFrom(baseline),
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
      if (movement.exercise.kind === 'cardio') {
        const state = states.get(movement.exercise.id) ?? emptyState();
        const distances = paceDistances(movement.exercise.name);
        for (const item of movement.sets) {
          if (isCardioRecordEligible(item))
            addCardioSet(state.cardio, item.duration_seconds, item.distance_km, distances);
        }
        states.set(movement.exercise.id, state);
        continue;
      }
      if (movement.exercise.kind !== 'strength') continue;
      const state = states.get(movement.exercise.id) ?? emptyState();
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
    const state = states.get(movement.exercise.id) ?? emptyState();
    const badges = new Map<string, string[]>();
    if (movement.exercise.kind === 'cardio') {
      const distances = paceDistances(movement.exercise.name);
      for (const item of movement.sets) {
        if (!isCardioRecordEligible(item)) continue;
        const hits = addCardioSet(state.cardio, item.duration_seconds, item.distance_km, distances);
        if (hits.length) badges.set(item.key, hits.map(cardioHitLabel));
      }
      states.set(movement.exercise.id, state);
      result.set(movement.key, badges);
      continue;
    }
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
  /** The account's fresh starts, oldest first; each forms a PR baseline until the next. */
  freshStarts: string[] = [],
) {
  const lifetime = calculateDraftPrs(
    movements,
    historicalWorkouts,
    excludedWorkoutId,
    workoutDate,
    olderHistory,
    measurements,
  );
  const fresh = freshStartOn(freshStarts, workoutDate);
  if (!blocks.length && !fresh) return lifetime;
  const block = blockOn(blocks, workoutDate);
  const since = (
    start: string,
    end: string | null | undefined,
    bestOf: (baseline: ExerciseHistoryBaseline) => HistoryBest | null | undefined,
  ) => {
    const scopedOlder = new Map<string, ExerciseHistoryBaseline>();
    for (const [id, baseline] of olderHistory ?? []) {
      const best = bestOf(baseline);
      if (best) scopedOlder.set(id, { ...baseline, ...best });
    }
    return calculateDraftPrs(
      movements,
      historicalWorkouts.filter(
        (workout) => workout.workout_date >= start && (!end || workout.workout_date < end),
      ),
      excludedWorkoutId,
      workoutDate,
      scopedOlder,
      measurements,
    );
  };
  const none = new Map<string, Map<string, string[]>>();
  const sinceFresh = fresh
    ? since(fresh.start, fresh.end, (baseline) =>
        baseline.fresh_start_bests?.find((item) => item.start_date === fresh.start),
      )
    : none;
  const inBlock = block
    ? since(block.start_date, block.end_date, (baseline) =>
        baseline.block_bests?.find((item) => item.block_id === block.id),
      )
    : none;
  const lower = (label: string) => `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  // Each record is named once, by its broadest scope: all-time, then a fresh start, then block.
  return new Map(
    movements.map((movement) => {
      const badges = new Map<string, string[]>();
      for (const item of movement.sets) {
        const all = lifetime.get(movement.key)?.get(item.key) ?? [];
        const freshLabels = (sinceFresh.get(movement.key)?.get(item.key) ?? []).filter(
          (label) => !all.includes(label),
        );
        const blockLabels = (inBlock.get(movement.key)?.get(item.key) ?? []).filter(
          (label) => !all.includes(label) && !freshLabels.includes(label),
        );
        const labels = [
          ...all.map((label) => `All-time ${lower(label)}`),
          ...freshLabels.map((label) => `Fresh start ${lower(label)}`),
          ...blockLabels.map((label) => `Block ${lower(label)}`),
        ];
        if (labels.length) badges.set(item.key, labels);
      }
      return [movement.key, badges];
    }),
  );
}

/** A record set just logged in the live workout, for its celebrate toast. */
export type PrToastEntry = { exercise: string; labels: string[] } & (
  | { reps: number; weightKg: number; bodyweightKg?: number | null }
  /** A cardio set, described by what it covered, such as “7.2 km in 36:00”. */
  | { summary: string }
);

/** The celebrate toast's lines: which records the set beat, then the set itself. */
export function prToastLines(entries: PrToastEntry[], weightUnit: WeightUnit) {
  return entries.map((entry) => ({
    title: entry.labels.join(' + '),
    detail:
      'summary' in entry
        ? [entry.exercise, entry.summary].filter(Boolean).join(' · ')
        : `${entry.exercise} · ${entry.reps} reps at ${formatWeight(entry.weightKg, weightUnit)}` +
          (entry.bodyweightKg != null
            ? ` · ${bodyweightContext(entry.weightKg, entry.bodyweightKg, weightUnit)}`
            : ''),
  }));
}

/** A live workout's record badges: labels by set key, by movement key. */
export type DraftPrBadges = Map<string, Map<string, string[]>>;

/** Identifies a celebrated set's records, so the same ones never celebrate twice. */
export function prSignature(
  exerciseId: string,
  item: WorkoutSetInput & { key: string },
  labels: string[],
) {
  return `${exerciseId}:${item.key}:${labels.join(',')}:${item.weight_kg}:${item.reps}:${item.duration_seconds}:${item.distance_km}`;
}

/** Which sets have been seen ticked, and which records have already been celebrated. */
export interface PrCelebrations {
  completedSetKeys: Set<string>;
  celebrated: Set<string>;
}

/** The records a workout opens with are never celebrated again: only new ones are. */
export function initialPrCelebrations(
  movements: DraftMovement[],
  badges: DraftPrBadges,
): PrCelebrations {
  return {
    completedSetKeys: new Set(
      movements.flatMap((movement) =>
        movement.sets.filter((item) => item.completed).map((item) => item.key),
      ),
    ),
    celebrated: new Set(
      movements.flatMap((movement) =>
        movement.sets.flatMap((item) => {
          const labels = badges.get(movement.key)?.get(item.key);
          return item.completed && labels ? [prSignature(movement.exercise.id, item, labels)] : [];
        }),
      ),
    ),
  };
}

/**
 * The record sets just ticked that have not been celebrated yet, for the celebrate toast, and
 * the state to compare the next change with. `bodyweightFor` gives a set's bodyweight on the
 * workout's day.
 */
export function newPrCelebrations(
  movements: DraftMovement[],
  badges: DraftPrBadges,
  previous: PrCelebrations,
  bodyweightFor: (recorded: number | null | undefined) => number | null,
): { entries: PrToastEntry[]; next: PrCelebrations } {
  const completedSetKeys = new Set<string>();
  const celebrated = new Set(previous.celebrated);
  const entries: PrToastEntry[] = [];
  for (const movement of movements) {
    for (const item of movement.sets) {
      if (!item.completed) continue;
      completedSetKeys.add(item.key);
      const labels = badges.get(movement.key)?.get(item.key);
      if (previous.completedSetKeys.has(item.key) || !labels) continue;
      const signature = prSignature(movement.exercise.id, item, labels);
      if (celebrated.has(signature)) continue;
      celebrated.add(signature);
      entries.push(
        movement.exercise.kind === 'cardio'
          ? {
              exercise: movement.exercise.name,
              labels,
              summary: cardioSetSummary(item.duration_seconds, item.distance_km),
            }
          : {
              exercise: movement.exercise.name,
              labels,
              reps: item.reps!,
              weightKg: item.weight_kg!,
              bodyweightKg: bodyweightFor(item.bodyweight_kg),
            },
      );
    }
  }
  return { entries, next: { completedSetKeys, celebrated } };
}

/** The short badge a record set shows: its broadest scope. */
export function prBadgeLabel(labels: string[]): string {
  if (labels.some((label) => label.startsWith('All-time'))) return 'All-time PR';
  if (labels.some((label) => label.startsWith('Fresh start'))) return 'Fresh start PR';
  if (labels.some((label) => label.startsWith('Block'))) return 'Block PR';
  return 'PR';
}
