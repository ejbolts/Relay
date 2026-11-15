import { useState, type FormEvent } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import type { Exercise } from './types';

/** Renames a custom exercise; its workouts, records and photos follow the new name. */
export function ExerciseRenameDialog({
  exercise,
  onRenamed,
  onClose,
}: {
  exercise: Exercise;
  onRenamed: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(exercise.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !trimmed) return;
    if (trimmed === exercise.name) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onRenamed(await api.updateExercise(exercise.id, { name: trimmed }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The exercise could not be renamed.');
      setSaving(false);
    }
  }

  return (
    <PopupDialog
      title="Rename exercise"
      className="exercise-rename-dialog"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form onSubmit={submit}>
        <label>
          Name
          <input
            value={name}
            maxLength={160}
            autoComplete="off"
            autoFocus
            onFocus={(event) => event.target.select()}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="popup-dialog-actions">
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="popup-primary-action" disabled={saving || !trimmed}>
            {saving ? 'Saving…' : 'Save name'}
          </button>
        </footer>
      </form>
    </PopupDialog>
  );
}
