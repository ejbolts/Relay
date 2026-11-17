import { useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import { REP_RANGE_PRESETS, repRangeKey, repRangeLabel } from './repProgression';
import { suggestedRepRange, withRepRange } from './routineRepRange';
import type { Routine } from './types';

/** Gives a planned exercise a rep range without opening the split editor. */
export function RepRangeDialog({
  exerciseId,
  exerciseName,
  reps,
  routine,
  onClose,
  onSaved,
}: {
  exerciseId: string;
  exerciseName: string;
  /** The reps the exercise has been stuck at, used to suggest a range with room above them. */
  reps: number;
  routine: Routine;
  onClose: () => void;
  onSaved: (routine: Routine) => void;
}) {
  const [selected, setSelected] = useState(() =>
    repRangeKey(suggestedRepRange(reps, REP_RANGE_PRESETS)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const range = REP_RANGE_PRESETS.find((item) => repRangeKey(item) === selected);
    if (!range || saving) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.routines.save(withRepRange(routine, exerciseId, range)));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the rep range.');
      setSaving(false);
    }
  }

  return (
    <PopupDialog
      title="Rep range"
      kicker={exerciseName.toUpperCase()}
      className="rep-range-dialog"
      onClose={onClose}
    >
      <div className="rep-range-form">
        <div className="rep-range-options" role="radiogroup" aria-label="Rep range">
          {REP_RANGE_PRESETS.map((range) => {
            const key = repRangeKey(range);
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected === key}
                className={selected === key ? 'is-selected' : undefined}
                onClick={() => setSelected(key)}
              >
                {repRangeLabel(range)}
              </button>
            );
          })}
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="popup-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="popup-primary-action"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </PopupDialog>
  );
}
