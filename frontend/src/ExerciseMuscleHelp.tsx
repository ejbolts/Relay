import { useContext, useRef, useState } from 'react';
import { ExerciseCreditsContext } from './exerciseCreditsContext';
import { PopupDialog } from './PopupDialog';
import { Icon } from './Icon';
import { partialSetsEnabledForWeek } from './exercisePartialSets';
import { addDays, weekStartFor } from './trainingSummary';
import { useTrainingPreferences } from './trainingPreferencesContext';
import { localDate } from './utils';
import type { Exercise } from './types';
import './exerciseMuscleHelp.css';

export function ExerciseMuscleHelp({ exercise }: { exercise: Exercise }) {
  const context = useContext(ExerciseCreditsContext);
  const ownedExercise = context?.exercises.find((item) => item.id === exercise.id);
  exercise = ownedExercise ?? exercise;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { preferences } = useTrainingPreferences();
  const weekStartDay =
    preferences?.week_start === 'sunday' ? 0 : preferences?.week_start === 'saturday' ? 6 : 1;
  const today = localDate();
  const currentWeek = weekStartFor(today, weekStartDay);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardio = exercise.kind === 'cardio' || exercise.category === 'cardio';
  const credits = exercise.default_muscle_set_credits ?? exercise.muscle_set_credits ?? [];
  const direct = credits.filter((credit) => credit.sets >= 1);
  const partial = credits.filter((credit) => credit.sets > 0 && credit.sets < 1);
  const partialEnabled = partialSetsEnabledForWeek(exercise, selectedWeek);

  async function togglePartialSets() {
    if (!context || !ownedExercise || saving) return;
    setSaving(true);
    setError(null);
    try {
      await context.updatePartialSets(exercise.id, !partialEnabled, selectedWeek);
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
        onClick={() => {
          setSelectedWeek(weekStartFor(localDate(), weekStartDay));
          setError(null);
          setOpen(true);
        }}
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
                  <label className="exercise-credit-week">
                    <span>Week of</span>
                    <span className="exercise-credit-week-controls">
                      <button
                        type="button"
                        aria-label="Previous partial-set week"
                        disabled={saving}
                        onClick={() => {
                          setSelectedWeek(addDays(selectedWeek, -7));
                          setError(null);
                        }}
                      >
                        <Icon name="chevron-left" />
                      </button>
                      <input
                        type="date"
                        aria-label="Partial-set week"
                        value={selectedWeek}
                        max={today}
                        disabled={saving}
                        onChange={(event) => {
                          if (event.target.value && event.target.value <= today)
                            setSelectedWeek(weekStartFor(event.target.value, weekStartDay));
                          setError(null);
                        }}
                      />
                      <button
                        type="button"
                        aria-label="Next partial-set week"
                        disabled={saving || selectedWeek >= currentWeek}
                        onClick={() => {
                          setSelectedWeek(addDays(selectedWeek, 7));
                          setError(null);
                        }}
                      >
                        <Icon name="chevron-right" />
                      </button>
                    </span>
                  </label>
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
                Partial sets carry forward from the selected week until changed again. Earlier weeks
                keep their settings. Direct sets always count; warmups and unfinished sets do not.
              </p>
            </>
          )}
        </PopupDialog>
      )}
    </span>
  );
}
