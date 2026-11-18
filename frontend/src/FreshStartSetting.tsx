import { useState } from 'react';
import { api } from './api';
import { HelpPopup } from './HelpPopup';
import { useTrainingBlocks } from './trainingBlocksContext';
import { localDate } from './utils';
import './freshStartSetting.css';

/** An account-wide PR baseline that works with or without training blocks. */
export function FreshStartSetting() {
  const { config, changed } = useTrainingBlocks();
  const freshStart = config.fresh_start ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Typing a date passes through partial years, so the date saves when the field is left.
  const [draft, setDraft] = useState<string | null>(null);
  const today = localDate();

  const change = (value: string | null) => {
    setSaving(true);
    setError(null);
    api.trainingBlocks
      .setFreshStart(value)
      .then(changed)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? `Could not change the fresh start. ${reason.message}`
            : 'Could not change the fresh start. Try again.',
        ),
      )
      .finally(() => {
        setSaving(false);
        setDraft(null);
      });
  };

  return (
    <section className="settings-panel panel" aria-labelledby="pr-fresh-start-title">
      <header>
        <h2 id="pr-fresh-start-title" className="profile-help-row">
          Personal records{' '}
          <HelpPopup title="Fresh start">
            <p>
              Lifts from the fresh start date form a new baseline, so you can earn Fresh start PRs
              again after a break, an injury or a change of gym. All-time PRs still count, and no
              workouts are changed.
            </p>
          </HelpPopup>
        </h2>
      </header>
      <div className="notification-setting-row">
        <strong>Fresh start</strong>
        <button
          type="button"
          role="switch"
          aria-label="Fresh start for personal records"
          aria-checked={freshStart !== null}
          className={freshStart ? 'is-on' : ''}
          disabled={saving}
          onClick={() => change(freshStart ? null : today)}
        >
          <span />
          {freshStart ? 'On' : 'Off'}
        </button>
      </div>
      {freshStart && (
        <label className="notification-setting-row fresh-start-date">
          <strong>Since</strong>
          <input
            type="date"
            required
            max={today}
            value={draft ?? freshStart}
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (draft && draft <= today && draft !== freshStart) change(draft);
              else setDraft(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
      )}
      {error && (
        <p className="fresh-start-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
