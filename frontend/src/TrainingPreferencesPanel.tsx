import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { MuscleGoalEditor } from './MuscleGoalEditor';
import { StatusToast } from './StatusToast';
import { useTrainingPreferences } from './trainingPreferencesContext';
import type { Exercise, TrainingPreferences } from './types';

/** How long a pause in typing a weekly goal waits before saving; leaving the field saves at once. */
export const GOAL_SAVE_DELAY_MS = 800;

const GOAL_ERROR = 'Enter weekly muscle set goals between 1 and 1,000 whole sets.';
const validGoal = (goal: number) => Number.isInteger(goal) && goal >= 1 && goal <= 1000;
const validGoals = (preferences: TrainingPreferences) =>
  validGoal(preferences.weekly_muscle_set_goal) &&
  Object.values(preferences.weekly_muscle_set_goals ?? {}).every(validGoal);

/**
 * Units, week start and weekly set goals. Each change saves by itself, like the switches around
 * it: the menus straight away, typed goals after a short pause or when the field is left.
 */
export function TrainingPreferencesPanel({
  exercises,
  onDataChange,
}: {
  exercises: Exercise[];
  onDataChange: () => Promise<void>;
}) {
  const shared = useTrainingPreferences();
  const [draft, setDraft] = useState<TrainingPreferences | null>(shared.preferences);
  const [error, setError] = useState<string | null>(shared.error);
  // Counts saves, so each one restarts the toast's timer.
  const [savedToast, setSavedToast] = useState(0);
  // The newest edit that has not reached the server yet.
  const unsaved = useRef<TrainingPreferences | null>(null);
  const saving = useRef(false);
  const timer = useRef<number | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    // Follow the shared copy, unless an edit made here is still on its way to the server.
    if (unsaved.current || saving.current) return;
    setDraft(shared.preferences);
    setError(shared.error);
  }, [shared.preferences, shared.error]);

  saveRef.current = async () => {
    const next = unsaved.current;
    if (!next || saving.current) return;
    if (!validGoals(next)) {
      setError(GOAL_ERROR);
      return;
    }
    unsaved.current = null;
    saving.current = true;
    setError(null);
    let failed = false;
    try {
      const saved = await api.updateTrainingPreferences(next);
      shared.applySaved(saved);
      if (!unsaved.current) setDraft(saved);
      await onDataChange();
      window.dispatchEvent(new Event('training-preferences-updated'));
      setSavedToast((count) => count + 1);
    } catch (reason) {
      failed = true;
      // Keep the edit, so the next change or leaving the field tries again.
      unsaved.current ??= next;
      setError(reason instanceof Error ? reason.message : 'Could not save training preferences.');
    } finally {
      saving.current = false;
    }
    // Edits made while that save was running.
    if (!failed && unsaved.current) await saveRef.current();
  };

  function cancelTimer() {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }

  function change(next: TrainingPreferences, when: 'now' | 'after-typing') {
    setDraft(next);
    unsaved.current = next;
    setError(null);
    cancelTimer();
    if (when === 'now') {
      void saveRef.current();
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void saveRef.current();
    }, GOAL_SAVE_DELAY_MS);
  }

  function saveTypedGoals() {
    if (timer.current === null) return;
    cancelTimer();
    void saveRef.current();
  }

  useEffect(
    () => () => {
      // Leaving mid-pause still saves what was typed.
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        void saveRef.current();
      }
    },
    [],
  );

  return (
    <section className="settings-panel panel" aria-labelledby="training-preferences-title">
      <header>
        <div>
          <p className="section-kicker">TRAINING</p>
          <h2 id="training-preferences-title">Units &amp; weekly goals</h2>
        </div>
      </header>
      {draft && (
        <div className="training-preferences-grid">
          <label>
            Weight unit
            <select
              value={draft.preferred_weight_unit}
              onChange={(event) =>
                change(
                  { ...draft, preferred_weight_unit: event.target.value as 'kg' | 'lb' },
                  'now',
                )
              }
            >
              <option value="kg">Kilograms</option>
              <option value="lb">Pounds</option>
            </select>
          </label>
          <label>
            Week starts
            <select
              value={draft.week_start}
              onChange={(event) =>
                change(
                  {
                    ...draft,
                    week_start: event.target.value as TrainingPreferences['week_start'],
                  },
                  'now',
                )
              }
            >
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
              <option value="saturday">Saturday</option>
            </select>
          </label>
          <label>
            Default weekly sets per muscle
            <input
              type="number"
              inputMode="numeric"
              enterKeyHint="next"
              min="1"
              max="1000"
              step="1"
              value={draft.weekly_muscle_set_goal || ''}
              aria-invalid={validGoal(draft.weekly_muscle_set_goal) ? undefined : true}
              onChange={(event) =>
                change(
                  { ...draft, weekly_muscle_set_goal: Number(event.target.value) },
                  'after-typing',
                )
              }
              onBlur={saveTypedGoals}
            />
          </label>
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <MuscleGoalEditor
          exercises={exercises}
          defaultGoal={draft.weekly_muscle_set_goal}
          goals={draft.weekly_muscle_set_goals}
          onChange={(goals) => change({ ...draft, weekly_muscle_set_goals: goals }, 'after-typing')}
          onCommit={saveTypedGoals}
        />
      )}
      {savedToast > 0 && (
        <StatusToast
          key={savedToast}
          message="Training preferences saved."
          onClose={() => setSavedToast(0)}
        />
      )}
    </section>
  );
}
