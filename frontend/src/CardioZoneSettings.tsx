import { useState } from 'react';
import { api } from './api';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import type { CardioPreferences } from './types';
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
  const [zones, setZones] = useState(() =>
    Array.from({ length: 5 }, (_, index) => {
      const saved = preferences.heart_rate_zones.find((item) => item.zone === index + 1);
      return {
        zone: index + 1,
        min: saved?.min_bpm.toString() ?? '',
        max: saved?.max_bpm.toString() ?? '',
      };
    }),
  );
  const [goals, setGoals] = useState(preferences.goals);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unusedZone = [1, 2, 3, 4, 5].find((zone) => !goals.some((goal) => goal.zone === zone));
  return (
    <PopupDialog title="Heart-rate zones & goals" onClose={onClose} className="cardio-zone-dialog">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          const anyRange = zones.some((zone) => zone.min !== '' || zone.max !== '');
          const ranges = anyRange
            ? zones.map((zone) => ({
                zone: zone.zone,
                min_bpm: Number(zone.min),
                max_bpm: Number(zone.max),
              }))
            : [];
          if (anyRange && zones.some((zone) => !zone.min || !zone.max)) {
            setError('Enter a minimum and maximum for all five zones.');
            return;
          }
          if (
            ranges.some(
              (zone, index) =>
                zone.min_bpm > zone.max_bpm ||
                (index > 0 && ranges[index - 1].max_bpm >= zone.min_bpm),
            )
          ) {
            setError('Zone ranges must increase without overlapping.');
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
                  min="20"
                  max="250"
                  step="1"
                  aria-label={`Zone ${zone.zone} ${bound === 'min' ? 'minimum' : 'maximum'} bpm`}
                  value={zone[bound]}
                  onChange={(event) =>
                    setZones(
                      zones.map((item, row) =>
                        row === index ? { ...item, [bound]: event.target.value } : item,
                      ),
                    )
                  }
                />,
              ])}
            </div>
          ))}
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
                {[1, 2, 3, 4, 5].map((zone) => (
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
                min="1"
                max="10080"
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
              className="cardio-goal-add"
              onClick={() => setGoals([...goals, { zone: unusedZone, minutes: 30 }])}
            >
              <Icon name="plus" />
              Add goal
            </button>
          )}
        </fieldset>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-action" disabled={saving}>
          {saving ? 'Saving…' : 'Save zones & goals'}
        </button>
      </form>
    </PopupDialog>
  );
}
