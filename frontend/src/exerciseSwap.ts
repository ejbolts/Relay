import { exerciseEquipment } from './exerciseEquipment';
import type { Exercise } from './types';
import type { WorkoutDraftMovement, WorkoutDraftSet } from './workoutMovements';

/** At or above this overlap an alternative counts as training the same muscles. */
export const SAME_MUSCLES_MATCH = 90;
/** Alternatives below this overlap are too different to offer. */
export const MIN_SWAP_MATCH = 25;

export interface SwapAlternative {
  exercise: Exercise;
  /** Percentage of the original exercise's muscle credit the alternative also earns. */
  match: number | null;
  equipment: string;
}

/**
 * Muscle credit per working set, one entry per muscle. Uses the same source as the weekly muscle
 * sets, including half credits, so a swap keeps the week's totals close.
 */
export function swapMuscleCreditList(exercise: Exercise): { muscle: string; sets: number }[] {
  if (exercise.kind === 'cardio' || exercise.category === 'cardio') return [];
  const source = exercise.default_muscle_set_credits ??
    exercise.muscle_set_credits ?? [{ muscle_name: exercise.muscle_group, sets: 1 }];
  const credits = new Map<string, { muscle: string; sets: number }>();
  for (const credit of source) {
    const muscle = credit.muscle_name.trim();
    if (!muscle || !(credit.sets > 0)) continue;
    const key = muscle.toLowerCase();
    const current = credits.get(key);
    credits.set(key, {
      muscle: current?.muscle ?? muscle,
      sets: (current?.sets ?? 0) + credit.sets,
    });
  }
  return [...credits.values()];
}

/** {@link swapMuscleCreditList} keyed by lower-case muscle name. */
export function swapMuscleCredits(exercise: Exercise): Map<string, number> {
  return new Map(
    swapMuscleCreditList(exercise).map(({ muscle, sets }) => [muscle.toLowerCase(), sets]),
  );
}

/** Σ min(original, candidate) ÷ Σ original over the original's muscles, as a whole percentage. */
export function muscleMatchPercent(original: Exercise, candidate: Exercise): number {
  const from = swapMuscleCredits(original);
  const to = swapMuscleCredits(candidate);
  let total = 0;
  let shared = 0;
  for (const [muscle, sets] of from) {
    total += sets;
    shared += Math.min(sets, to.get(muscle) ?? 0);
  }
  return total > 0 ? Math.round((shared / total) * 100) : 0;
}

/**
 * Exercises that can replace `original`, best muscle match first. Ties go to recently used
 * exercises, then by name. Cardio exercises have no muscle credit, so any other cardio exercise
 * is offered without a match percentage.
 */
export function rankSwapAlternatives(
  original: Exercise,
  exercises: Exercise[],
  {
    excludedIds = [],
    recentExerciseIds = [],
  }: {
    excludedIds?: readonly string[];
    recentExerciseIds?: readonly string[];
  } = {},
): SwapAlternative[] {
  const excluded = new Set([original.id, ...excludedIds]);
  const recentRank = new Map(recentExerciseIds.map((id, index) => [id, index]));
  const cardio = original.kind === 'cardio';
  return exercises
    .filter(
      (exercise) =>
        !excluded.has(exercise.id) && !exercise.hidden && exercise.kind === original.kind,
    )
    .map((exercise) => ({
      exercise,
      match: cardio ? null : muscleMatchPercent(original, exercise),
      equipment: exerciseEquipment(exercise.equipment),
    }))
    .filter((item) => item.match === null || item.match >= MIN_SWAP_MATCH)
    .sort(
      (a, b) =>
        (b.match ?? 0) - (a.match ?? 0) ||
        (recentRank.get(a.exercise.id) ?? Infinity) - (recentRank.get(b.exercise.id) ?? Infinity) ||
        a.exercise.name.localeCompare(b.exercise.name),
    );
}

function isWarmup(set: WorkoutDraftSet): boolean {
  return set.set_type === 'warmup' || Boolean(set.warmup);
}

/**
 * Carry a planned set over to `replacement`. Reps, set type, rest and notes stay; the load
 * comes from the replacement's last session (`suggestion`) because a weight on one exercise
 * means nothing on another.
 */
function carrySet(
  set: WorkoutDraftSet,
  suggestion: WorkoutDraftSet | undefined,
  replacement: Exercise,
): WorkoutDraftSet {
  const carried: WorkoutDraftSet = {
    ...set,
    key: crypto.randomUUID(),
    completed: false,
    machine_photo_id: null,
    failed: false,
    weight_kg: suggestion?.weight_kg ?? null,
  };
  if (replacement.kind === 'cardio') {
    carried.distance_km = suggestion?.distance_km ?? null;
    carried.speed_kph = suggestion?.speed_kph ?? null;
    carried.incline_percent = suggestion?.incline_percent ?? null;
  }
  return carried;
}

/**
 * Replace a movement's exercise mid-workout. Logged sets stay with the original exercise; the
 * planned sets move to `replacement` in a new movement right after it. When nothing is logged
 * yet the movement is replaced in place. `suggestedSets` are the replacement's sets from its
 * last session and supply loads (or the whole plan when there is nothing left to carry).
 * `machine` is the replacement's machine choice; without one the logger restores its last machine.
 */
export function swapMovementExercise(
  movements: WorkoutDraftMovement[],
  movementKey: string,
  replacement: Exercise,
  suggestedSets: WorkoutDraftSet[],
  machine: Pick<
    WorkoutDraftMovement,
    'machinePhotoIds' | 'machinePhotosInitialized' | 'machineSettings'
  > = { machinePhotoIds: [], machinePhotosInitialized: false, machineSettings: undefined },
): WorkoutDraftMovement[] {
  const index = movements.findIndex((movement) => movement.key === movementKey);
  if (index < 0) return movements;
  const original = movements[index];
  const logged = original.sets.filter((set) => set.completed);
  const planned = original.sets.filter((set) => !set.completed);
  const sameKind = original.exercise.kind === replacement.kind;
  // Match warm-ups with warm-ups and working sets with working sets, in order.
  const pools = {
    warmup: suggestedSets.filter(isWarmup),
    working: suggestedSets.filter((set) => !isWarmup(set)),
  };
  const used = { warmup: 0, working: 0 };
  const sets =
    sameKind && planned.length
      ? planned.map((set) => {
          const group = isWarmup(set) ? 'warmup' : 'working';
          const pool = pools[group];
          const suggestion = pool[used[group]++] ?? pool.at(-1);
          return carrySet(set, suggestion, replacement);
        })
      : suggestedSets;
  const originName = original.swappedFrom ?? original.exercise.name;
  const replacementMovement: WorkoutDraftMovement = {
    ...original,
    key: logged.length ? crypto.randomUUID() : original.key,
    exercise: replacement,
    notes: logged.length ? '' : original.notes,
    ...machine,
    isComplete: false,
    swappedFrom: originName === replacement.name ? undefined : originName,
    sets,
  };
  if (!logged.length) {
    return movements.map((movement, i) => (i === index ? replacementMovement : movement));
  }
  const next = [...movements];
  next.splice(index, 1, { ...original, sets: logged, isComplete: true }, replacementMovement);
  return next;
}
