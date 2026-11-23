import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { PopupDialog } from './PopupDialog';
import {
  exerciseMuscleChoices,
  newExerciseDraft,
  prepareExerciseInput,
  type ExerciseCreationDraft,
} from './exerciseCreation';
import { similarExercises } from './exerciseSearch';
import type { Exercise, ExerciseCreateInput, ExerciseKind, WorkoutCategory } from './types';
import './createExercise.css';

export function CreateExerciseDialog({
  exercises,
  categoryLabels,
  initialName,
  initialCategory,
  viewportHeight,
  viewportTop,
  onCreate,
  onCreated,
  onUseExisting = onCreated,
  onClose,
}: {
  exercises: Exercise[];
  categoryLabels: Record<WorkoutCategory, string>;
  initialName: string;
  initialCategory: WorkoutCategory | '';
  viewportHeight?: number;
  viewportTop?: number;
  onCreate: (input: ExerciseCreateInput) => Promise<Exercise>;
  onCreated: (exercise: Exercise) => void;
  /**
   * Picks an existing exercise suggested while the name is typed, instead of adding a new one.
   * Without it, the existing exercise goes to `onCreated`, as the exercise picker wants.
   */
  onUseExisting?: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const formId = useId();
  const duplicateId = useId();
  const [viewport, setViewport] = useState(() => ({
    height: viewportHeight ?? window.visualViewport?.height ?? window.innerHeight,
    top: viewportTop ?? window.visualViewport?.offsetTop ?? 0,
  }));
  const [draft, setDraft] = useState<ExerciseCreationDraft>(() =>
    newExerciseDraft(initialName, initialCategory),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Existing exercises that look like the name being typed, checked as it changes.
  const matches = useMemo(() => similarExercises(exercises, draft.name), [exercises, draft.name]);
  const duplicate = matches.some(
    (exercise) =>
      exercise.name.trim().toLocaleLowerCase() === draft.name.trim().toLocaleLowerCase(),
  );
  const strength = draft.kind !== 'cardio' && draft.category !== 'cardio';
  const muscleGroups = exerciseMuscleChoices(exercises);

  useEffect(() => {
    if (viewportHeight !== undefined) return;
    const visualViewport = window.visualViewport;
    const update = () =>
      setViewport({
        height: visualViewport?.height ?? window.innerHeight,
        top: visualViewport?.offsetTop ?? 0,
      });
    window.addEventListener('resize', update);
    visualViewport?.addEventListener('resize', update);
    visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      visualViewport?.removeEventListener('resize', update);
      visualViewport?.removeEventListener('scroll', update);
    };
  }, [viewportHeight]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    setError(null);
    // The duplicate is already flagged beside the name, with the existing exercise to use.
    if (duplicate) {
      nameRef.current?.focus();
      return;
    }
    try {
      const input = prepareExerciseInput(draft, exercises);
      savingRef.current = true;
      setSaving(true);
      const exercise = await onCreate(input);
      onCreated(exercise);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the exercise.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <PopupDialog
      title="Add exercise"
      className="create-exercise-dialog"
      busy={saving}
      // Kept inside the visible area above the keyboard.
      style={
        {
          '--create-exercise-viewport-height': `${viewportHeight ?? viewport.height}px`,
          '--create-exercise-viewport-top': `${viewportTop ?? viewport.top}px`,
        } as CSSProperties
      }
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            className="create-exercise-cancel"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" form={formId} className="popup-primary-action" disabled={saving}>
            {saving ? 'Adding…' : 'Add exercise'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void submit(event)} aria-busy={saving}>
        <fieldset disabled={saving}>
          <legend className="sr-only">Exercise details</legend>
          <label className="create-exercise-name">
            Name
            <input
              ref={nameRef}
              autoFocus
              required
              maxLength={160}
              value={draft.name}
              aria-invalid={duplicate || undefined}
              aria-describedby={duplicate ? duplicateId : undefined}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Exercise name"
            />
          </label>
          {matches.length > 0 && (
            <div className="create-exercise-matches">
              {duplicate && (
                <p className="create-exercise-duplicate" id={duplicateId}>
                  Already in your library
                </p>
              )}
              {matches.map((exercise) => (
                <button
                  type="button"
                  className="create-exercise-match"
                  key={exercise.id}
                  onClick={() => onUseExisting(exercise)}
                >
                  Use {exercise.name}
                </button>
              ))}
            </div>
          )}
          <label>
            Category
            <select
              required
              value={draft.category}
              onChange={(event) => {
                const category = event.target.value as WorkoutCategory | '';
                setDraft((current) => ({
                  ...current,
                  category,
                  kind: category === 'cardio' ? 'cardio' : 'strength',
                }));
              }}
            >
              <option value="">Choose category</option>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={draft.kind}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  kind: event.target.value as ExerciseKind,
                }))
              }
            >
              <option value="strength">Strength</option>
              <option value="cardio">Cardio</option>
            </select>
          </label>
          {strength ? (
            <section className="create-exercise-muscles" aria-label="Target muscles">
              <h3>Target muscles</h3>
              {draft.muscle_set_credits.map((credit, index) => (
                <div className="create-exercise-muscle-row" key={index}>
                  <label>
                    Muscle
                    <select
                      required
                      aria-label={`Target muscle ${index + 1}`}
                      value={credit.muscle_name}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          muscle_set_credits: current.muscle_set_credits.map((item, i) =>
                            i === index ? { ...item, muscle_name: event.target.value } : item,
                          ),
                        }))
                      }
                    >
                      <option value="">Choose muscle</option>
                      {muscleGroups
                        .filter(
                          (group) =>
                            !draft.muscle_set_credits.some(
                              (item, i) => i !== index && item.muscle_name === group,
                            ),
                        )
                        .map((group) => (
                          <option value={group} key={group}>
                            {group}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Set credit
                    <select
                      aria-label={`Credit per working set ${index + 1}`}
                      value={credit.sets}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          muscle_set_credits: current.muscle_set_credits.map((item, i) =>
                            i === index
                              ? { ...item, sets: Number(event.target.value) as 0.5 | 1 }
                              : item,
                          ),
                        }))
                      }
                    >
                      <option value={1}>Direct · 1</option>
                      <option value={0.5}>Partial · ½</option>
                    </select>
                  </label>
                  <button
                    className="create-exercise-remove-muscle"
                    type="button"
                    aria-label={`Remove muscle ${index + 1}`}
                    disabled={draft.muscle_set_credits.length === 1}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        muscle_set_credits: current.muscle_set_credits.filter(
                          (_, i) => i !== index,
                        ),
                      }))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="pulse-button tonal small create-exercise-add-muscle"
                type="button"
                disabled={draft.muscle_set_credits.length >= muscleGroups.length}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    muscle_set_credits: [
                      ...current.muscle_set_credits,
                      { muscle_name: '', sets: 1 },
                    ],
                  }))
                }
              >
                + Add muscle
              </button>
            </section>
          ) : (
            <label>
              Muscle group
              <input
                required
                maxLength={100}
                value={draft.muscle_group}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    muscle_group: event.target.value,
                  }))
                }
                placeholder="e.g. Lats"
              />
            </label>
          )}
          <label>
            Equipment (optional)
            <input
              maxLength={100}
              value={draft.equipment}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  equipment: event.target.value,
                }))
              }
              placeholder="e.g. Cable"
            />
          </label>
        </fieldset>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </PopupDialog>
  );
}
