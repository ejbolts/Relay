import { useId, useState } from 'react';
import { PopupDialog } from './PopupDialog';
import { useWeightUnit } from './trainingPreferencesContext';
import type { BodyMeasurement } from './types';
import { localDate } from './utils';
import { WeightInput } from './WeightInput';
import { weightInputValue } from './weightUnits';
import type { BodyCheckInPayload } from './bodyCheckInUndo';
import { IMPORTED_BODYWEIGHT_NOTE, weighInDraft, weighInPayload } from './bodyCheckInForm';

export { IMPORTED_BODYWEIGHT_NOTE };
export type WeighInPayload = BodyCheckInPayload;

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
    const checked = weighInPayload(date, draft, weightUnit);
    if (checked.error !== null) {
      setError(checked.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(checked.payload);
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
