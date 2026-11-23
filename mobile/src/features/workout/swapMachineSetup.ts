import type { ExerciseMachineChoices } from '../../../../frontend/src/exerciseMachineChoices';
import { machineAliases, withSuggestedSets } from '../../../../frontend/src/exerciseHistory';
import { swapMovementExercise } from '../../../../frontend/src/exerciseSwap';
import type {
  Exercise,
  MachineSetting,
  TrackedSet,
  TrackedWorkout,
} from '../../../../frontend/src/types';
import type { WorkoutDraftMovement } from '../../../../frontend/src/workoutMovements';
import { machineSelection } from '../../../../frontend/src/workoutMovements';
import { lastSessionSetsOnMachine } from '../../../../frontend/src/workoutStartMovements';
import { apiGet } from '../../data/api';
import { isToastAccountCurrent, toastAccount } from '../../ui/Toast';
import { machineSettings } from './loggerQueries';
import { swapExercise, type LoggerContext, type LoggerState } from './loggerState';

type Change = (update: (state: LoggerState) => LoggerState) => void;

/** What the chosen machine adds once it has loaded: its saved setup and its last session. */
export interface MachineSetup {
  settings: MachineSetting[] | null;
  /** The machine's last session's sets, when the loaded history had none on it. */
  lastSets: TrackedSet[] | null;
}

/**
 * Swaps an exercise for another, as `swapExercise` does, and with a machine chosen for the
 * replacement, then fills in what the loaded history can't: the machine's saved settings (as the
 * web's logger loads them for a newly pinned machine), and, when the recent history has no
 * session on that machine, its last session from the machine's own workouts, so the planned loads
 * are that machine's as recorded rather than another machine's. Both apply only while the swapped
 * movement still has that exercise and machine, its sets are untouched and the account is the
 * same; settings already in the draft are kept.
 */
export function swapOntoMachine(
  change: Change,
  movementKey: string,
  replacement: Exercise,
  context: LoggerContext,
  machineChoices: ExerciseMachineChoices = {},
  excludedWorkoutId?: string,
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
  const machineId = machineChoices[replacement.id];
  const { before, swapped } = captured;
  if (!before || !swapped || !machineId) return Promise.resolve();
  const excluded = excludedWorkoutId ?? before.resumingWorkoutId ?? undefined;
  const workoutDate = before.workoutDate;
  const needsHistory =
    lastSessionSetsOnMachine(context.workouts, replacement.id, workoutDate, excluded, machineId) ===
    null;
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
          (workouts) => machineLastSets(workouts, replacement.id, workoutDate, excluded, machineId),
          () => null,
        )
      : Promise.resolve(null),
  ]).then(([settings, lastSets]) => {
    if (!isToastAccountCurrent(account)) return;
    change((current) =>
      withMachineSetup(
        current,
        before,
        swapped,
        movementKey,
        replacement,
        machineId,
        {
          settings,
          lastSets,
        },
        context.newKey,
      ),
    );
  });
}

/** The movement the swap made for the replacement: new in `next`, with its exercise. */
function swappedMovement(current: LoggerState, next: LoggerState, exerciseId: string) {
  return next.movements.find(
    (movement) => movement.exercise.id === exerciseId && !current.movements.includes(movement),
  );
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
 * Applies a machine's setup to the movement a swap made, if it is still as the swap left it:
 * the same exercise pinned to the same machine. Planned loads are replaced only while its sets
 * are untouched; settings only while the draft has none.
 */
export function withMachineSetup(
  current: LoggerState,
  before: LoggerState,
  swapped: WorkoutDraftMovement,
  movementKey: string,
  replacement: Exercise,
  machineId: string,
  setup: MachineSetup,
  newKey: () => string,
): LoggerState {
  const index = current.movements.findIndex((movement) => movement.key === swapped.key);
  const movement = current.movements[index];
  if (
    !movement ||
    movement.exercise.id !== replacement.id ||
    movement.machinePhotoIds.length !== 1 ||
    movement.machinePhotoIds[0] !== machineId
  )
    return current;
  let next = movement;
  if (setup.lastSets?.length && movement.sets === swapped.sets) {
    const redone = swapMovementExercise(
      before.movements,
      movementKey,
      replacement,
      withSuggestedSets([], setup.lastSets, replacement.kind, newKey),
      machineSelection(replacement.id, { [replacement.id]: machineId }),
      newKey,
    ).find((item) => item.exercise.id === replacement.id && !before.movements.includes(item));
    if (redone) next = { ...next, sets: redone.sets };
  }
  if (setup.settings && movement.machineSettings === undefined)
    next = { ...next, machineSettings: setup.settings };
  if (next === movement) return current;
  const movements = [...current.movements];
  movements[index] = next;
  return { ...current, movements };
}
