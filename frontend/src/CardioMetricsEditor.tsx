import { useState } from 'react';
import type { CardioMetricsInput, CardioSession } from './types';
import { PopupDialog } from './PopupDialog';
import { prettyDate } from './appShared';

function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

/** What a blank field falls back to: the calculated value when there is one. */
function autoPlaceholder(estimate: number | null | undefined): string {
  return estimate == null ? 'Optional' : `Auto · ${estimate.toLocaleString()}`;
}

export function CardioMetricsEditor({
  session,
  onClose,
  onSave,
}: {
  session: CardioSession;
  onClose: () => void;
  onSave: (metrics: CardioMetricsInput) => Promise<void>;
}) {
  const [calories, setCalories] = useState(session.calories_kcal?.toString() ?? '');
  const [heartRate, setHeartRate] = useState(session.average_heart_rate_bpm?.toString() ?? '');
  const [distance, setDistance] = useState(session.distance_km?.toString() ?? '');
  const [speed, setSpeed] = useState(session.average_speed_kph?.toString() ?? '');
  const [incline, setIncline] = useState(session.incline_percent?.toString() ?? '');
  const [power, setPower] = useState(session.average_power_watts?.toString() ?? '');
  const [mets, setMets] = useState(session.average_mets?.toString() ?? '');
  const [elevation, setElevation] = useState(session.elevation_gain_m?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <PopupDialog title="Cardio metrics" kicker="PERFORMANCE" onClose={onClose}>
      <form
        className="cardio-metrics-dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await onSave({
              calories_kcal: optionalNumber(calories),
              average_heart_rate_bpm: optionalNumber(heartRate),
              distance_km: optionalNumber(distance),
              average_speed_kph: optionalNumber(speed),
              incline_percent: optionalNumber(incline),
              average_power_watts: optionalNumber(power),
              average_mets: optionalNumber(mets),
              elevation_gain_m: optionalNumber(elevation),
            });
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
          <label>
            Calories (kcal)
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="100000"
              step="1"
              value={calories}
              onChange={(event) => setCalories(event.target.value)}
            />
          </label>
          <label>
            Average HR (bpm)
            <input
              type="number"
              inputMode="numeric"
              min="20"
              max="250"
              step="1"
              value={heartRate}
              onChange={(event) => setHeartRate(event.target.value)}
            />
          </label>
          <label>
            Distance (km)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="10000"
              step="0.01"
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
            />
          </label>
          <label>
            Average speed (km/h)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.1"
              value={speed}
              onChange={(event) => setSpeed(event.target.value)}
            />
          </label>
          <label>
            Incline (%)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.1"
              value={incline}
              onChange={(event) => setIncline(event.target.value)}
            />
          </label>
          {(session.activity_type.toLocaleLowerCase().includes('cycl') ||
            session.activity_type.toLocaleLowerCase().includes('bike')) && (
            <label>
              Average power (watts)
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="3000"
                step="1"
                value={power}
                onChange={(event) => setPower(event.target.value)}
              />
            </label>
          )}
          <label>
            Elevation gain (m)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="30000"
              step="0.1"
              value={elevation}
              onChange={(event) => setElevation(event.target.value)}
              placeholder={autoPlaceholder(session.estimated_elevation_gain_m)}
            />
          </label>
          <label>
            Average MET
            <input
              type="number"
              inputMode="decimal"
              min="0.1"
              max="50"
              step="0.1"
              value={mets}
              onChange={(event) => setMets(event.target.value)}
              placeholder={autoPlaceholder(session.estimated_mets)}
            />
          </label>
        </div>
        <p className="cardio-metric-hint">All performance fields are optional.</p>
        {error && <p className="inline-error">{error}</p>}
        <footer className="popup-dialog-actions">
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="popup-primary-action" disabled={saving}>
            {saving ? 'Saving…' : 'Save metrics'}
          </button>
        </footer>
      </form>
    </PopupDialog>
  );
}
