import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { MachineSettingsSummary } from './MachineSettingsEditor';
import { PopupDialog } from './PopupDialog';
import { useWeightUnit } from './trainingPreferencesContext';
import { formatWeight } from './weightUnits';
import type { Exercise, TrackedWorkout } from './types';

export function ExerciseSessionSheet({
  workoutId,
  dataRevision,
  exercise,
  onClose,
  onOpenWorkout,
}: {
  workoutId: string;
  dataRevision: string | null;
  exercise: Exercise;
  onClose: () => void;
  onOpenWorkout: () => void;
}) {
  const weightUnit = useWeightUnit();
  const [workout, setWorkout] = useState<TrackedWorkout | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    let cancelled = false;
    setError(false);
    setWorkout(null);
    void api
      .getWorkout(workoutId)
      .then((result) => {
        if (!cancelled) setWorkout(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workoutId, attempt, dataRevision]);
  useEffect(
    () => () => {
      const element = previousFocus.current;
      requestAnimationFrame(() => element?.focus());
    },
    [],
  );
  const movements =
    workout?.movements.filter((movement) => movement.exercise.id === exercise.id) ?? [];
  let workingSetNumber = 0;
  return (
    <PopupDialog
      title={exercise.name}
      className="exercise-session-sheet"
      onClose={onClose}
      swipeToDismiss
    >
      {!workout && !error && <p role="status">Loading session…</p>}
      {error && (
        <div role="alert">
          <p>Could not load this session.</p>
          <button
            type="button"
            className="text-link"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {workout && (
        <>
          <div className="exercise-session-heading">
            <strong>
              {new Date(`${workout.workout_date}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </strong>
            <span>{workout.name}</span>
          </div>
          {movements.flatMap((movement) =>
            movement.notes
              ? [
                  <p className="exercise-session-note" key={movement.id}>
                    {movement.notes}
                  </p>,
                ]
              : [],
          )}
          {movements.map((movement) => (
            <MachineSettingsSummary key={movement.id} settings={movement.machine_settings} />
          ))}
          <table>
            <thead>
              <tr>
                <th>Set</th>
                <th>Weight</th>
                <th>Reps</th>
                <th>RPE</th>
              </tr>
            </thead>
            <tbody>
              {movements
                .flatMap((movement) => movement.sets)
                .filter((set) => set.completed)
                .map((set) => (
                  <tr key={set.id}>
                    <td>
                      {set.warmup || set.set_type === 'warmup' ? 'W' : ++workingSetNumber}
                      {set.failed ? ' · Failed' : ''}
                    </td>
                    <td>{set.weight_kg == null ? '—' : formatWeight(set.weight_kg, weightUnit)}</td>
                    <td>{set.reps ?? '—'}</td>
                    <td>{set.rpe ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!movements.length && <p>This exercise is no longer in the workout.</p>}
          <button type="button" className="pulse-button primary" onClick={onOpenWorkout}>
            Open workout
          </button>
        </>
      )}
    </PopupDialog>
  );
}
