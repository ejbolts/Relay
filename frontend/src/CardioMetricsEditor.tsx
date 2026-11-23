import { useId, useState } from 'react';
import type { CardioMetricsInput, CardioSession } from './types';
import { PopupDialog } from './PopupDialog';
import { prettyDate } from './appShared';

import {
  cardioMetricAutoPlaceholder,
  cardioMetricDraft,
  cardioMetricFields,
  parseCardioMetrics,
} from './cardioForm';

export function CardioMetricsEditor({
  session,
  onClose,
  onSave,
}: {
  session: CardioSession;
  onClose: () => void;
  onSave: (metrics: CardioMetricsInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => cardioMetricDraft(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  return (
    <PopupDialog
      title="Cardio metrics"
      busy={saving}
      onClose={onClose}
      actions={
        <>
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="popup-primary-action" disabled={saving}>
            {saving ? 'Saving…' : 'Save metrics'}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="cardio-metrics-dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await onSave(parseCardioMetrics(draft));
            onClose();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not save cardio metrics.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <p>
          {session.activity_type} · {prettyDate(session.session_date)} · {session.duration_minutes}{' '}
          min
        </p>
        <div className="cardio-metric-fields">
          {cardioMetricFields(session.activity_type).map(({ key, label, min, max, step }) => (
            <label key={key}>
              {label}
              <input
                type="number"
                inputMode={step === 1 ? 'numeric' : 'decimal'}
                min={min}
                max={max}
                step={step}
                value={draft[key]}
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                placeholder={
                  key === 'elevation_gain_m'
                    ? cardioMetricAutoPlaceholder(session.estimated_elevation_gain_m)
                    : key === 'average_mets'
                      ? cardioMetricAutoPlaceholder(session.estimated_mets)
                      : undefined
                }
              />
            </label>
          ))}
        </div>
        <p className="cardio-metric-hint">All performance fields are optional.</p>
        {error && <p className="inline-error">{error}</p>}
      </form>
    </PopupDialog>
  );
}
