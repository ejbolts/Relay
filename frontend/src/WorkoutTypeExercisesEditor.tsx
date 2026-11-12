import { useContext, useEffect, useId, useState, type CSSProperties, type FormEvent } from 'react';
import { api } from './api';
import { ExerciseCreditsContext } from './exerciseCreditsContext';
import { PopupDialog } from './PopupDialog';
import { RoutineMovementList } from './RoutineMovementList';
import type { Exercise, RoutineMovement, WorkoutType } from './types';
import './routines.css';

const failure = (reason: unknown, fallback: string) =>
  reason instanceof Error ? reason.message : fallback;

/** Edits the exercises saved to one workout type, outside of any split. */
export function WorkoutTypeExercisesEditor({
  type,
  movements: initial,
  onSaved,
  onClose,
}: {
  type: WorkoutType;
  movements: RoutineMovement[];
  onSaved: (movements: RoutineMovement[]) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const [movements, setMovements] = useState(() => structuredClone(initial));
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const strengthSets = movements
    .filter((m) => m.exercise.kind !== 'cardio')
    .reduce((sum, m) => sum + m.sets.length, 0);
  const cardioMinutes = Math.round(
    movements
      .filter((m) => m.exercise.kind === 'cardio')
      .reduce(
        (sum, m) => sum + m.sets.reduce((seconds, set) => seconds + (set.duration_seconds ?? 0), 0),
        0,
      ) / 60,
  );
  const libraryExercises = useContext(ExerciseCreditsContext)?.exercises;
  const latest = (exercise: Exercise) =>
    libraryExercises?.find((item) => item.id === exercise.id) ?? exercise;
  useEffect(() => {
    let live = true;
    api.listExercises().then(
      (items) => {
        if (live) {
          setExercises(items);
          setLoadError(null);
        }
      },
      (reason) => {
        if (live) setLoadError(failure(reason, 'Could not load your exercises.'));
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (movements.some((m) => m.sets.some((set) => (set.weight_kg ?? 0) > 10000))) {
      setError('Starting weights must be no more than 10,000 kg.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveWorkoutTypeExercises(type.id, movements);
      onSaved(saved.movements);
    } catch (reason) {
      setError(failure(reason, 'Could not save the exercises. Try again.'));
      setBusy(false);
    }
  }
  return (
    <PopupDialog
      title={`${type.name} exercises`}
      className="routine-editor-dialog routine-editor-screen type-exercises-dialog"
      style={{ '--day-colour': type.color } as CSSProperties}
      closeLabel={
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 5.5 8 12l6.5 6.5" />
        </svg>
      }
      headerActions={
        <button
          type="submit"
          form={formId}
          className="routine-editor-save"
          disabled={busy || !!loadError}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      }
      onClose={onClose}
    >
      <form id={formId} onSubmit={(event) => void submit(event)} className="routine-editor">
        <fieldset disabled={busy}>
          {loadError && (
            <p role="alert" className="inline-error">
              {loadError}{' '}
              <button type="button" onClick={() => setAttempt((x) => x + 1)}>
                Try again
              </button>
            </p>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <section className="routine-day-body type-exercises-body" aria-label={type.name}>
            <div className="type-exercises-summary">
              <span className="type-exercises-name">
                <i aria-hidden="true" />
                {type.name}
              </span>
              <span>
                {movements.length} {movements.length === 1 ? 'exercise' : 'exercises'}
                {strengthSets > 0 && ` · ${strengthSets} ${strengthSets === 1 ? 'set' : 'sets'}`}
                {cardioMinutes > 0 && ` · ${cardioMinutes} min`}
              </span>
            </div>
            <RoutineMovementList
              layout="cards"
              movements={movements}
              exercises={exercises}
              target={type.name}
              fieldLabel={(index) => `${type.name} exercise ${index + 1}`}
              latest={latest}
              onChange={setMovements}
            />
          </section>
        </fieldset>
      </form>
    </PopupDialog>
  );
}
