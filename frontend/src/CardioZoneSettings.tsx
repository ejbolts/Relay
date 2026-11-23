import { useId, useState } from 'react';
import { api } from './api';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import type { CardioPreferences } from './types';
import {
  CARDIO_GOAL_MINUTES,
  CARDIO_MAX_HEART_RATE,
  CARDIO_ZONE_BPM,
  CARDIO_ZONE_NUMBERS,
  cardioZoneDrafts,
  invalidZoneFields,
  parseCardioZoneRanges,
  validCardioInteger,
  withZoneMax,
  zonesFromMaxHeartRate,
} from './cardioZones';
import './cardioZones.css';

export function CardioZoneSettings({
  preferences,
  onClose,
  onSaved,
}: {
  preferences: CardioPreferences;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [zones, setZones] = useState(() => cardioZoneDrafts(preferences));
  const [goals, setGoals] = useState(preferences.goals);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxHeartRate, setMaxHeartRate] = useState('');
  // Fields are marked once Save finds a problem, and clear as they are fixed.
  const [checked, setChecked] = useState(false);
  const invalid = checked ? invalidZoneFields(zones) : new Set<string>();
  const maxBpm = Number(maxHeartRate);
  const canFill = validCardioInteger(maxBpm, CARDIO_MAX_HEART_RATE);
  const unusedZone = CARDIO_ZONE_NUMBERS.find((zone) => !goals.some((goal) => goal.zone === zone));
  const formId = useId();
  return (
    <PopupDialog
      title="Heart-rate zones & goals"
      busy={saving}
      onClose={onClose}
      className="cardio-zone-dialog"
      actions={
        <>
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="popup-primary-action" disabled={saving}>
            {saving ? 'Saving…' : 'Save zones & goals'}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          let ranges;
          try {
            ranges = parseCardioZoneRanges(zones);
          } catch (reason) {
            setChecked(true);
            setError(reason instanceof Error ? reason.message : 'Check the heart-rate zones.');
            return;
          }
          setSaving(true);
          try {
            await api.updateCardioPreferences({ heart_rate_zones: ranges, goals });
            window.dispatchEvent(new Event('training-preferences-updated'));
            await onSaved();
            onClose();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not save cardio goals.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <fieldset disabled={saving}>
          <legend>Personal ranges (bpm)</legend>
          <div className="cardio-zone-fill">
            <label>
              <span>Max heart rate</span>
              <input
                type="number"
                inputMode="numeric"
                min={CARDIO_MAX_HEART_RATE.min}
                max={CARDIO_MAX_HEART_RATE.max}
                step="1"
                placeholder="bpm"
                value={maxHeartRate}
                onChange={(event) => setMaxHeartRate(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="pulse-button secondary"
              disabled={!canFill}
              onClick={() => {
                setZones(zonesFromMaxHeartRate(maxBpm));
                setError(null);
              }}
            >
              Fill zones
            </button>
          </div>
          <div className="cardio-zone-columns" aria-hidden="true">
            <span>Zone</span>
            <span>From</span>
            <span />
            <span>To</span>
          </div>
          {zones.map((zone, index) => (
            <div className="cardio-zone-columns" key={zone.zone}>
              <strong>Zone {zone.zone}</strong>
              {(['min', 'max'] as const).map((bound) => [
                bound === 'max' && (
                  <span key="to" className="cardio-zone-dash" aria-hidden="true">
                    –
                  </span>
                ),
                <input
                  key={bound}
                  type="number"
                  inputMode="numeric"
                  min={CARDIO_ZONE_BPM.min}
                  max={CARDIO_ZONE_BPM.max}
                  step="1"
                  aria-label={`Zone ${zone.zone} ${bound === 'min' ? 'minimum' : 'maximum'} bpm`}
                  aria-invalid={invalid.has(`${zone.zone}:${bound}`) || undefined}
                  value={zone[bound]}
                  onChange={(event) => {
                    const value = event.target.value;
                    setZones(
                      bound === 'max'
                        ? withZoneMax(zones, index, value)
                        : zones.map((item, row) =>
                            row === index ? { ...item, min: value } : item,
                          ),
                    );
                  }}
                />,
              ])}
            </div>
          ))}
          {error && invalid.size > 0 && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
        <fieldset disabled={saving}>
          <legend>Weekly goals</legend>
          <div className="cardio-goal-row" aria-hidden="true">
            <span>Zone</span>
            <span>Minutes</span>
          </div>
          {goals.map((goal, index) => (
            <div className="cardio-goal-row" key={index}>
              <select
                aria-label={`Goal ${index + 1} zone`}
                value={goal.zone}
                onChange={(event) =>
                  setGoals(
                    goals.map((item, row) =>
                      row === index ? { ...item, zone: Number(event.target.value) } : item,
                    ),
                  )
                }
              >
                {CARDIO_ZONE_NUMBERS.map((zone) => (
                  <option
                    key={zone}
                    value={zone}
                    disabled={goals.some((other, row) => row !== index && other.zone === zone)}
                  >
                    Zone {zone}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={CARDIO_GOAL_MINUTES.min}
                max={CARDIO_GOAL_MINUTES.max}
                step="1"
                required
                inputMode="numeric"
                aria-label={`Goal ${index + 1} minutes`}
                value={goal.minutes || ''}
                onChange={(event) =>
                  setGoals(
                    goals.map((item, row) =>
                      row === index ? { ...item, minutes: Number(event.target.value) } : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="cardio-goal-remove"
                disabled={goals.length === 1}
                aria-label={`Remove Zone ${goal.zone} goal`}
                onClick={() => setGoals(goals.filter((_, row) => row !== index))}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
          {unusedZone && (
            <button
              type="button"
              className="pulse-button tonal small cardio-goal-add"
              onClick={() => setGoals([...goals, { zone: unusedZone, minutes: 30 }])}
            >
              <Icon name="plus" />
              Add goal
            </button>
          )}
        </fieldset>
        {error && invalid.size === 0 && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </PopupDialog>
  );
}
