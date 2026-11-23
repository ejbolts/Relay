import { useState } from 'react';
import { api } from './api';
import { useToast } from './Toast';
import { useTrainingPreferences } from './trainingPreferencesContext';
import { defaultRestChoices } from './trainingSettings';
import { formatSeconds } from './utils';
import './defaultRestSetting.css';

/**
 * The rest a new set gets when last time gives none. Unset by default, so a set has no rest
 * until the user gives it one.
 */
export function DefaultRestSetting() {
  const shared = useTrainingPreferences();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seconds = shared.preferences?.default_rest_seconds ?? null;

  async function change(value: number | null) {
    if (!shared.preferences) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateTrainingPreferences({
        ...shared.preferences,
        default_rest_seconds: value,
      });
      shared.applySaved(saved);
      window.dispatchEvent(new Event('training-preferences-updated'));
      toast.show('Default rest saved.');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `Could not save the default rest. ${reason.message}`
          : 'Could not save the default rest. Try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <label className="notification-setting-row default-rest-setting">
        <strong>Default rest</strong>
        <select
          aria-label="Default rest"
          value={seconds ?? ''}
          disabled={saving || !shared.preferences}
          onChange={(event) =>
            void change(event.target.value === '' ? null : Number(event.target.value))
          }
        >
          <option value="">None</option>
          {defaultRestChoices(seconds).map((choice) => (
            <option key={choice} value={choice}>
              {formatSeconds(choice)}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="default-rest-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
