import { useContext, useRef, useState } from 'react';
import { ExerciseCreditsContext } from './exerciseCreditsContext';
import { PopupDialog } from './PopupDialog';
import type { Exercise } from './types';
import './exerciseMuscleHelp.css';

export function ExerciseMuscleHelp({ exercise }: { exercise: Exercise }) {
  const context = useContext(ExerciseCreditsContext);
  const ownedExercise = context?.exercises.find((item) => item.id === exercise.id);
  exercise = ownedExercise ?? exercise;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardio = exercise.kind === 'cardio' || exercise.category === 'cardio';
  const credits = exercise.default_muscle_set_credits ?? exercise.muscle_set_credits ?? [];
  const direct = credits.filter((credit) => credit.sets >= 1);
  const partial = credits.filter((credit) => credit.sets > 0 && credit.sets < 1);
  const partialEnabled = exercise.partial_sets_enabled !== false;

  async function togglePartialSets() {
    if (!context || !ownedExercise || saving) return;
    setSaving(true);
    setError(null);
    try {
      await context.updatePartialSets(exercise.id, !partialEnabled);
    } catch {
      setError('Could not save partial sets. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <span
      className="exercise-muscle-help"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') event.stopPropagation();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="exercise-muscle-help-button"
        aria-label={`Muscle set credits for ${exercise.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
          <path d="M12 16.5h.01" />
        </svg>
      </button>
      {open && (
        <PopupDialog
          title={exercise.name}
          kicker="MUSCLE SET CREDITS"
          className="exercise-muscle-dialog"
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => triggerRef.current?.focus());
          }}
        >
          {cardio ? (
            <p>Cardio does not add strength sets to your weekly muscle totals.</p>
          ) : (
            <>
              {partial.length > 0 && ownedExercise && context && (
                <div className="exercise-partial-control">
                  <label>
                    <span>Count partial sets</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={partialEnabled}
                      disabled={saving}
                      onChange={() => void togglePartialSets()}
                    />
                  </label>
                  {saving && <span role="status">Saving…</span>}
                  {error && (
                    <p role="alert" className="inline-error">
                      {error}
                    </p>
                  )}
                </div>
              )}
              {credits.length ? (
                <div className="exercise-muscle-credit-groups">
                  {[
                    { title: 'Direct work', items: direct },
                    { title: 'Partial credit · assistance', items: partial },
                  ].map(({ title, items }) => (
                    <section key={title}>
                      <h3>{title}</h3>
                      {items.length ? (
                        <ul>
                          {items.map((credit) => (
                            <li key={credit.muscle_name}>
                              <span>{credit.muscle_name}</span>
                              <strong
                                className={
                                  credit.sets < 1 && !partialEnabled ? 'credit-disabled' : undefined
                                }
                              >
                                {credit.sets < 1 && !partialEnabled
                                  ? 'Off'
                                  : `${credit.sets} ${credit.sets === 1 ? 'set' : 'sets'}`}
                              </strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="exercise-muscle-note">
                          No {title === 'Direct work' ? 'direct' : 'partial'} credits assigned.
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <p>No muscle set credits are available for this exercise.</p>
              )}
              <p className="exercise-muscle-note">
                Credits apply to each completed working set. Changing partial sets updates this
                exercise across your saved workouts; direct sets stay counted. Warmups and
                unfinished sets do not count.
              </p>
            </>
          )}
        </PopupDialog>
      )}
    </span>
  );
}
