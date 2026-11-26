import { useState } from 'react';
import './workoutAutoSaveSetting.css';
import {
  DEFAULT_WORKOUT_AUTO_SAVE_MINUTES,
  autoSaveChoiceLabel,
  autoSaveChoices,
  saveWorkoutAutoSave,
  useWorkoutAutoSaveMinutes,
} from './workoutAutoSaveChoice';

export function WorkoutAutoSaveSetting({ userId }: { userId: string }) {
  const minutes = useWorkoutAutoSaveMinutes();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = minutes !== null;
  const choices = autoSaveChoices(minutes);

  const change = (value: number | null) => {
    setSaving(true);
    setError(null);
    saveWorkoutAutoSave(userId, value)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? `Could not change auto-save. ${reason.message}`
            : 'Could not change auto-save. Try again.',
        ),
      )
      .finally(() => setSaving(false));
  };

  return (
    <section className="settings-panel panel" aria-labelledby="workout-auto-save-title">
      <header>
        <h2 id="workout-auto-save-title">Unfinished workouts</h2>
      </header>
      <div className="notification-setting-row">
        <strong>Auto-save</strong>
        <button
          type="button"
          role="switch"
          aria-label="Auto-save unfinished workouts"
          aria-checked={enabled}
          className={enabled ? 'is-on' : ''}
          disabled={saving}
          onClick={() => change(enabled ? null : DEFAULT_WORKOUT_AUTO_SAVE_MINUTES)}
        >
          <span />
          {enabled ? 'On' : 'Off'}
        </button>
      </div>
      {enabled && (
        <label className="notification-setting-row workout-auto-save-time">
          <strong>Save after</strong>
          <select
            value={minutes}
            disabled={saving}
            onChange={(event) => change(Number(event.target.value))}
          >
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {autoSaveChoiceLabel(choice)}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p className="workout-auto-save-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
