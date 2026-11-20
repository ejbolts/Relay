import { PopupDialog } from './PopupDialog';
import type { WorkoutSyncConflict } from './activeWorkoutSync';
import { workoutSyncDifferences } from './activeWorkoutSyncDiff';
import { useWeightUnit } from './trainingPreferencesContext';
import { finalizeWorkoutIdentity } from './workoutCategory';
import type { Exercise } from './types';
import './activeWorkoutSync.css';

export function ActiveWorkoutSyncDialog({
  conflict,
  exercises,
  onResolve,
  onClose,
}: {
  conflict: WorkoutSyncConflict;
  exercises: Exercise[];
  onResolve: (useLocal: boolean) => void;
  onClose: () => void;
}) {
  const unit = useWeightUnit();
  const remote = conflict.remote.draft;
  const named = conflict.local ?? remote;
  // Named as the logger shows it: typed, or from its exercises unless its type was chosen.
  const name = named
    ? finalizeWorkoutIdentity(
        named.movements
          .map((movement) => exercises.find((exercise) => exercise.id === movement.exerciseId))
          .filter((exercise): exercise is Exercise => exercise !== undefined),
        named.category,
        named.name,
        !named.workoutTypeExplicit,
      ).name
    : 'Workout';
  const differences = workoutSyncDifferences(
    conflict.local,
    remote,
    (id) => exercises.find((exercise) => exercise.id === id)?.name ?? 'Exercise',
    unit,
  );
  return (
    <PopupDialog
      title="Workout sync conflict"
      onClose={onClose}
      className="workout-sync-dialog"
      actions={
        <>
          <button type="button" onClick={() => onResolve(false)}>
            Use other device
          </button>
          <button type="button" className="popup-primary-action" onClick={() => onResolve(true)}>
            Keep this device
          </button>
        </>
      }
    >
      <p className="workout-sync-intro">
        Both devices changed <strong>{name}</strong>. Choose which version to keep.
      </p>
      {differences.length > 0 && (
        <ul className="workout-sync-differences">
          {differences.map((difference) => (
            <li key={difference.key}>
              <b>{difference.label}</b>
              <span>
                <small>This device</small>
                {difference.local}
              </span>
              <span>
                <small>Other device</small>
                {difference.remote}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PopupDialog>
  );
}
