import { PopupDialog } from './PopupDialog';
import type { WorkoutSyncConflict } from './activeWorkoutSync';
import type { ActiveWorkoutDraft } from './workoutDraft';
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
  function preview(draft: ActiveWorkoutDraft | null) {
    if (!draft) return <p>Workout ended</p>;
    return (
      <>
        <strong>{draft.name || 'Workout'}</strong>
        {draft.movements.map((movement) => (
          <div key={movement.key}>
            <b>
              {exercises.find((exercise) => exercise.id === movement.exerciseId)?.name ??
                'Exercise'}
            </b>
            <ol>
              {movement.sets.map((set) => (
                <li key={set.key}>
                  {set.weight_kg !== null ? `${set.weight_kg} kg · ` : ''}
                  {set.reps !== null ? `${set.reps} reps` : `${set.duration_seconds ?? 0} sec`}
                  {set.completed ? ' ✓' : ''}
                  {set.notes && <span>{set.notes}</span>}
                </li>
              ))}
            </ol>
            {movement.notes && <p>{movement.notes}</p>}
          </div>
        ))}
        {draft.notes && <p>{draft.notes}</p>}
      </>
    );
  }
  return (
    <PopupDialog title="Workout sync conflict" onClose={onClose} className="workout-sync-dialog">
      <p>Both devices changed the same workout. Choose which version to keep.</p>
      <div className="workout-sync-comparison">
        <section>
          <h3>This device</h3>
          {preview(conflict.local)}
        </section>
        <section>
          <h3>Other device</h3>
          {preview(conflict.remote.draft)}
        </section>
      </div>
      <div className="workout-sync-actions">
        <button type="button" onClick={() => onResolve(false)}>
          Use other device
        </button>
        <button type="button" className="primary-action" onClick={() => onResolve(true)}>
          Keep this device
        </button>
      </div>
    </PopupDialog>
  );
}
