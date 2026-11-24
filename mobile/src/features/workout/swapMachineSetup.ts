import type { ExerciseMachineChoices } from '../../../../frontend/src/exerciseMachineChoices';
import { machineAliases, withSuggestedSets } from '../../../../frontend/src/exerciseHistory';
import { swapMovementExercise } from '../../../../frontend/src/exerciseSwap';
import type {
  Exercise,
  MachineSetting,
  TrackedSet,
  TrackedWorkout,
} from '../../../../frontend/src/types';
import type {
  WorkoutDraftMovement,
  WorkoutDraftSet,
} from '../../../../frontend/src/workoutMovements';
import { machineSelection } from '../../../../frontend/src/workoutMovements';
import { lastSessionSetsOnMachine } from '../../../../frontend/src/workoutStartMovements';
import { apiGet } from '../../data/api';
import { isToastAccountCurrent, toastAccount } from '../../ui/Toast';
import { machineSettings } from './loggerQueries';
import { swapExercise, type LoggerContext, type LoggerState } from './loggerState';

type Change = (update: (state: LoggerState) => LoggerState) => void;

/**
 * The machine's last session, read from its own workouts: its sets, `none` when no saved workout
 * used it, or `failed` when it couldn't be read. Null when the loaded history already had it.
 */
export type MachineHistory =
  { kind: 'found'; sets: TrackedSet[] } | { kind: 'none' } | { kind: 'failed' };

/** What the chosen machine adds once it has loaded: its saved setup and its last session. */
export interface MachineSetup {
  settings: MachineSetting[] | null;
  history: MachineHistory | null;
}

/** The swap that made a movement row, with the sets it left and the loads it planned. */
export interface SwapInstance {
  id: number;
  /** The state just before the swap, to plan the replacement again from. */
  before: LoggerState;
  movementKey: string;
  /** The row the swap made. */
  rowKey: string;
  replacement: Exercise;
  machineId: string;
  workoutDate: string;
  /** The row's sets as the swap left them: untouched while the movement still holds them. */
  plannedSets: WorkoutDraftSet[];
  /** The loads the loaded history suggested, for a machine no saved workout has used yet. */
  fallbackSets: WorkoutDraftSet[];
}

// The newest swap onto each row. Swapping away and back reuses an unlogged row's key, so an
// older swap's late answers are told apart by their id and dropped.
const latestSwap = new Map<string, number>();
let swapCount = 0;

/**
 * Swaps an exercise for another, as `swapExercise` does, and with a machine chosen for the
 * replacement, then fills in what the loaded history can't: the machine's saved settings (as the
 * web's logger loads them for a newly pinned machine), and, when the recent history has no
 * session on that machine, its last session from the machine's own workouts, so the planned loads
 * are that machine's as recorded. Until that session arrives the loads stay empty rather than
 * another machine's, and they stay empty if it can't be read; a machine the picker knows no
 * saved workout has used keeps the general suggestion at once. Both apply only to the newest swap
 * onto the row, while it still has that exercise, machine and workout date, its sets are
 * untouched and the account is the same; settings already in the draft are kept, and carried
 * rows keep their keys, so a note or edit made meanwhile still reaches its row.
 */
export function swapOntoMachine(
  change: Change,
  movementKey: string,
  replacement: Exercise,
  context: LoggerContext,
  machineChoices: ExerciseMachineChoices = {},
  excludedWorkoutId?: string,
  /** Saved workout counts by machine id, as the picker knew them; a missing one is unknown. */
  machineUse: Readonly<Record<string, number>> = {},
): Promise<void> {
  const captured: { before?: LoggerState; swapped?: WorkoutDraftMovement } = {};
  // Both screens apply a change synchronously, so the swapped movement is known straight away.
  change((current) => {
    const next = swapExercise(
      current,
      movementKey,
      replacement,
      context,
      machineChoices,
      excludedWorkoutId,
    );
    if (next !== current) {
      captured.before = current;
      captured.swapped = swappedMovement(current, next, replacement.id);
    }
    return next;
  });
  const { before, swapped } = captured;
  if (!before || !swapped) return Promise.resolve();
  const id = (swapCount += 1);
  latestSwap.set(swapped.key, id);
  const machineId = machineChoices[replacement.id];
  if (!machineId) return Promise.resolve();
  const excluded = excludedWorkoutId ?? before.resumingWorkoutId ?? undefined;
  const workoutDate = before.workoutDate;
  // A machine no saved workout has used (one just photographed, say) has no session to wait
  // for: it keeps the general suggestion at once, as on the web, and only its settings load.
  const unused = machineUse[machineId] === 0;
  const needsHistory =
    !unused &&
    lastSessionSetsOnMachine(context.workouts, replacement.id, workoutDate, excluded, machineId) ===
      null;
  // Another machine's loads would be wrong here, so they wait for this machine's session.
  const plannedSets = needsHistory ? withoutLoads(swapped.sets) : swapped.sets;
  if (plannedSets !== swapped.sets)
    change((current) => withSets(current, swapped.key, swapped.sets, plannedSets));
  const swap: SwapInstance = {
    id,
    before,
    movementKey,
    rowKey: swapped.key,
    replacement,
    machineId,
    workoutDate,
    plannedSets,
    fallbackSets: swapped.sets,
  };
  const account = toastAccount();
  return Promise.all([
    machineSettings(replacement.id, machineId).then(
      (result) => (Array.isArray(result?.settings) ? result.settings : null),
      () => null,
    ),
    needsHistory
      ? apiGet<TrackedWorkout[]>(
          `/api/machine-photos/${encodeURIComponent(machineId)}/workouts`,
        ).then(
          (workouts): MachineHistory => {
            const sets = machineLastSets(
              workouts,
              replacement.id,
              workoutDate,
              excluded,
              machineId,
            );
            return sets ? { kind: 'found', sets } : { kind: 'none' };
          },
          (): MachineHistory => ({ kind: 'failed' }),
        )
      : Promise.resolve(null),
  ]).then(([settings, history]) => {
    if (!isToastAccountCurrent(account) || latestSwap.get(swap.rowKey) !== swap.id) return;
    change((current) => withMachineSetup(current, swap, { settings, history }, context.newKey));
  });
}

/** The movement the swap made for the replacement: new in `next`, with its exercise. */
function swappedMovement(current: LoggerState, next: LoggerState, exerciseId: string) {
  return next.movements.find(
    (movement) => movement.exercise.id === exerciseId && !current.movements.includes(movement),
  );
}

/** Planned sets with their loads left empty; logged sets as they are. */
function withoutLoads(sets: WorkoutDraftSet[]): WorkoutDraftSet[] {
  return sets.map((item) => (item.completed ? item : { ...item, weight_kg: null }));
}

/** Replaces a row's sets, only while it still holds `expected`. */
function withSets(
  current: LoggerState,
  rowKey: string,
  expected: WorkoutDraftSet[],
  sets: WorkoutDraftSet[],
): LoggerState {
  const index = current.movements.findIndex((movement) => movement.key === rowKey);
  if (index < 0 || current.movements[index].sets !== expected) return current;
  const movements = [...current.movements];
  movements[index] = { ...movements[index], sets };
  return { ...current, movements };
}

/** The machine's last session's sets from its own workouts, merged photos included. */
export function machineLastSets(
  workouts: TrackedWorkout[],
  exerciseId: string,
  onOrBeforeDate: string,
  excludedWorkoutId: string | undefined,
  machineId: string,
): TrackedSet[] | null {
  if (!Array.isArray(workouts)) return null;
  const aliases = machineAliases(
    workouts.flatMap((workout) =>
      workout.movements.flatMap((movement) => movement.machine_photos ?? []),
    ),
  );
  return lastSessionSetsOnMachine(
    workouts,
    exerciseId,
    onOrBeforeDate,
    excludedWorkoutId,
    aliases.get(machineId) ?? machineId,
    aliases,
  );
}

/**
 * Applies a machine's setup to the row a swap made, if it is still as the swap left it: the same
 * exercise pinned to the same machine. Loads change only while its sets are untouched (moving
 * them around is fine; they keep the order they were moved to) and the workout keeps the date the
 * session was chosen for, keeping each carried row's key; settings only while the draft has none.
 */
export function withMachineSetup(
  current: LoggerState,
  swap: SwapInstance,
  setup: MachineSetup,
  newKey: () => string,
): LoggerState {
  const index = current.movements.findIndex((movement) => movement.key === swap.rowKey);
  const movement = current.movements[index];
  if (
    !movement ||
    movement.exercise.id !== swap.replacement.id ||
    movement.machinePhotoIds.length !== 1 ||
    movement.machinePhotoIds[0] !== swap.machineId
  )
    return current;
  let next = movement;
  if (
    setup.history &&
    setup.history.kind !== 'failed' &&
    untouchedSets(movement.sets, swap.plannedSets) &&
    current.workoutDate === swap.workoutDate
  ) {
    const sets =
      setup.history.kind === 'found'
        ? replannedSets(swap, setup.history.sets, newKey)
        : swap.fallbackSets;
    if (sets) next = { ...next, sets: inCurrentOrder(sets, movement.sets) };
  }
  if (setup.settings && movement.machineSettings === undefined)
    next = { ...next, machineSettings: setup.settings };
  if (next === movement) return current;
  const movements = [...current.movements];
  movements[index] = next;
  return { ...current, movements };
}

/** Whether a row still holds exactly the sets the swap planned, in any order. */
function untouchedSets(sets: WorkoutDraftSet[], planned: WorkoutDraftSet[]) {
  return sets.length === planned.length && sets.every((item) => planned.includes(item));
}

/** `sets` in the order the row's sets are in now, matched by key; any new ones go last. */
function inCurrentOrder(sets: WorkoutDraftSet[], current: WorkoutDraftSet[]) {
  const byKey = new Map(sets.map((item) => [item.key, item]));
  const shown = new Set(current.map((item) => item.key));
  return [
    ...current.flatMap((item) => byKey.get(item.key) ?? []),
    ...sets.filter((item) => !shown.has(item.key)),
  ];
}

/** The swap planned again from the machine's session, each carried row keeping its key. */
function replannedSets(swap: SwapInstance, lastSets: TrackedSet[], newKey: () => string) {
  const { before, movementKey, replacement, machineId } = swap;
  const redone = swapMovementExercise(
    before.movements,
    movementKey,
    replacement,
    withSuggestedSets([], lastSets, replacement.kind, newKey),
    machineSelection(replacement.id, { [replacement.id]: machineId }),
    newKey,
  ).find((item) => item.exercise.id === replacement.id && !before.movements.includes(item));
  return redone?.sets.map((item, index) =>
    swap.plannedSets[index] ? { ...item, key: swap.plannedSets[index].key } : item,
  );
}
