import { useId, useState } from 'react';
import { PopupDialog } from './PopupDialog';
import { useWeightUnit } from './trainingPreferencesContext';
import type { BodyMeasurement } from './types';
import { localDate } from './utils';
import { WeightInput } from './WeightInput';
import { formatWeight, weightInputValue } from './weightUnits';

/** The note a CSV import leaves on a check-in; editing the check-in drops it. */
export const IMPORTED_BODYWEIGHT_NOTE = 'Imported from workout CSV.';

export interface WeighInPayload {
  measurement_date: string;
  weight_kg: number;
  body_fat_pct: number | null;
  notes: string | null;
}

interface Draft {
  weight: number | null;
  bodyFat: string;
  notes: string;
}

/** The fields for a day: its saved check-in, so saving changes it instead of wiping it. */
function weighInDraft(entry: BodyMeasurement | undefined): Draft {
  return {
    weight: entry?.weight_kg ?? null,
    bodyFat: entry?.body_fat_pct == null ? '' : String(entry.body_fat_pct),
    notes: entry?.notes && entry.notes !== IMPORTED_BODYWEIGHT_NOTE ? entry.notes : '',
  };
}

/**
 * Logs a weigh-in for today, or for another chosen day. It opens on today each time, and a day
 * that already has a check-in fills in its weight, body fat and note to update.
 */
export function WeighInDialog({
  measurements,
  onSave,
  onClose,
}: {
  measurements: BodyMeasurement[];
  onSave: (payload: WeighInPayload) => Promise<void>;
  onClose: () => void;
}) {
  const weightUnit = useWeightUnit();
  const entryOn = (day: string) => measurements.find((item) => item.measurement_date === day);
  const [date, setDate] = useState(localDate);
  const [draft, setDraft] = useState(() => weighInDraft(entryOn(localDate())));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const existing = entryOn(date);

  function chooseDate(next: string) {
    const entry = entryOn(next);
    // A typed weight carries over between empty days; a saved day's values never do.
    if (entry || existing) setDraft(weighInDraft(entry));
    setDate(next);
  }

  async function submit() {
    const weight = draft.weight;
    if (weight === null || !Number.isFinite(weight) || weight <= 0 || weight > 500) {
      setError(`Enter a body weight above 0 and up to ${formatWeight(500, weightUnit)}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        measurement_date: date,
        weight_kg: weight,
        body_fat_pct: draft.bodyFat ? Number(draft.bodyFat) : null,
        notes: draft.notes.trim() || null,
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this measurement.');
      setSaving(false);
    }
  }

  return (
    <PopupDialog
      title="Log weigh-in"
      className="body-entry-popup"
      onClose={onClose}
      busy={saving}
      actions={
        <>
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="popup-primary-action" disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Update check-in' : 'Save check-in'}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="body-entry-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="body-entry-fields">
          <label>
            Date
            <input type="date" value={date} onChange={(event) => chooseDate(event.target.value)} />
          </label>
          <label>
            Weight ({weightUnit})
            <WeightInput
              autoFocus
              weightKg={draft.weight}
              onWeightChange={(weight) => setDraft((current) => ({ ...current, weight }))}
              placeholder={weightInputValue(measurements[0]?.weight_kg ?? 88, weightUnit)}
            />
          </label>
          <label>
            Body fat %
            <input
              inputMode="decimal"
              type="number"
              min="1"
              max="70"
              step="0.1"
              value={draft.bodyFat}
              onChange={(event) =>
                setDraft((current) => ({ ...current, bodyFat: event.target.value }))
              }
              placeholder="Optional"
            />
          </label>
        </div>
        <textarea
          value={draft.notes}
          onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          placeholder="Conditions or anything worth remembering…"
          rows={2}
        />
        {error && <p className="inline-error">{error}</p>}
      </form>
    </PopupDialog>
  );
}
