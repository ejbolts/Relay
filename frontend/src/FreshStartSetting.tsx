import { useState, type FormEvent } from 'react';
import { api } from './api';
import { HelpPopup } from './HelpPopup';
import { Icon } from './Icon';
import { blockDay } from './trainingBlocks';
import { useTrainingBlocks } from './trainingBlocksContext';
import { freshStartDateError } from './trainingSettings';
import type { TrainingBlocks } from './types';
import { localDate } from './utils';
import './freshStartSetting.css';

/** Account-wide PR baselines that work with or without training blocks. */
export function FreshStartSetting() {
  const { config, changed } = useTrainingBlocks();
  const freshStarts = [...(config.fresh_starts ?? [])].reverse();
  const today = localDate();
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = (request: Promise<TrainingBlocks>, failure: string) => {
    setSaving(true);
    setError(null);
    return request
      .then(changed)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? `${failure} ${reason.message}` : `${failure} Try again.`,
        ),
      )
      .finally(() => setSaving(false));
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const error = freshStartDateError(date, today, freshStarts);
    if (error) {
      setError(error);
      return;
    }
    void save(api.trainingBlocks.addFreshStart(date), 'Could not add the fresh start.');
  };

  return (
    <section className="settings-panel panel" aria-labelledby="pr-fresh-start-title">
      <header>
        <h2 id="pr-fresh-start-title" className="profile-help-row">
          Fresh starts{' '}
          <HelpPopup title="Fresh starts">
            <p>
              Lifts from a fresh start form a new baseline until the next fresh start, so you can
              earn Fresh start PRs again after a break, an injury or a change of gym. All-time PRs
              still count, and no workouts are changed.
            </p>
          </HelpPopup>
        </h2>
      </header>
      {freshStarts.length > 0 && (
        <ul className="fresh-start-list" aria-label="Fresh starts">
          {freshStarts.map((item, index) => {
            const label = blockDay(item, true);
            return (
              <li key={item} className="notification-setting-row">
                <strong>{label}</strong>
                {index === 0 && <span className="fresh-start-current">Current</span>}
                <button
                  type="button"
                  className="pulse-button link small icon-only fresh-start-remove"
                  aria-label={`Remove fresh start on ${label}`}
                  disabled={saving}
                  onClick={() =>
                    void save(
                      api.trainingBlocks.removeFreshStart(item),
                      'Could not remove the fresh start.',
                    )
                  }
                >
                  <Icon name="trash" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="notification-setting-row fresh-start-add" onSubmit={add}>
        <input
          type="date"
          required
          max={today}
          value={date}
          aria-label="Fresh start date"
          disabled={saving}
          onChange={(event) => {
            setDate(event.target.value);
            setError(null);
          }}
        />
        <button type="submit" className="pulse-button small" disabled={saving}>
          Start fresh
        </button>
      </form>
      {error && (
        <p className="fresh-start-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
