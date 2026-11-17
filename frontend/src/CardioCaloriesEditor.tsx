import { useState } from 'react';
import type { CardioSession } from './types';
import { PopupDialog } from './PopupDialog';
import { parseCardioCalories } from './cardioEnergy';

export function CardioCaloriesEditor({
  session,
  onSave,
  onClose,
}: {
  session: CardioSession;
  onSave: (calories: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(session.calories_kcal?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <PopupDialog
      title="Cardio calories"
      className="cardio-calorie-dialog"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving) return;
          setError(null);
          try {
            const calories = parseCardioCalories(value);
            setSaving(true);
            await onSave(calories);
            onClose();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not save calories.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <p>
          {session.activity_type} · {session.session_date} · {session.duration_minutes} min
        </p>
        <label>
          Calories burned (kcal)
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="100000"
            step="1"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="e.g. 350"
            autoFocus
          />
        </label>
        <small>
          Enter the estimate from your machine or watch, preferably active calories. Leave blank if
          unknown.
        </small>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="primary-action" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save calories'}
          </button>
        </footer>
      </form>
    </PopupDialog>
  );
}
