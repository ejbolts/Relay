import { useState } from 'react';
import type { TrainingTime } from './types';
import { formatMinutesDuration } from './utils';
import { HelpPopup } from './HelpPopup';

export function TrainingTimeHelp() {
  return (
    <HelpPopup title="Time trained">
      <p>
        Totals use each workout's logged duration and every cardio session. Cardio done during a
        workout counts once in Combined.
      </p>
    </HelpPopup>
  );
}

/** The same totals on your own and shared profiles. */
export function TrainingTimeStats({ time }: { time: TrainingTime | null }) {
  const stats = [
    {
      label: 'Workouts',
      minutes: time?.workout_minutes,
      detail:
        time &&
        `${time.workout_count.toLocaleString('en-GB')} ${time.workout_count === 1 ? 'workout' : 'workouts'}`,
    },
    {
      label: 'Cardio',
      minutes: time?.cardio_minutes,
      detail:
        time &&
        `${time.cardio_count.toLocaleString('en-GB')} ${time.cardio_count === 1 ? 'session' : 'sessions'}`,
    },
    { label: 'Combined', minutes: time?.total_minutes, detail: time && 'All exercise' },
  ];
  return (
    <dl className="shared-stat-row">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd className="num">
            {stat.minutes === undefined ? '–' : formatMinutesDuration(stat.minutes)}
          </dd>
          {stat.detail && <small>{stat.detail}</small>}
        </div>
      ))}
    </dl>
  );
}

const TRAINING_TIME_RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'year', label: 'Past year' },
] as const;

type TrainingTimeRange = (typeof TRAINING_TIME_RANGES)[number]['value'];

/** Time trained, all time by default, with a past-year view when the server provides it. */
export function TrainingTimeCard({
  allTime,
  pastYear,
}: {
  allTime: TrainingTime;
  pastYear?: TrainingTime | null;
}) {
  const [range, setRange] = useState<TrainingTimeRange>('all');
  const time = range === 'year' && pastYear ? pastYear : allTime;
  return (
    <section
      className="settings-panel panel profile-training-time"
      aria-labelledby="shared-training-time-title"
    >
      <header>
        <div>
          <p className="section-kicker">ACTIVITY</p>
          <div className="profile-help-row">
            <h2 id="shared-training-time-title">Time trained</h2>
            <TrainingTimeHelp />
          </div>
        </div>
        {pastYear && (
          <div
            className="segmented-control compact training-time-range"
            role="radiogroup"
            aria-label="Time trained range"
          >
            {TRAINING_TIME_RANGES.map((option) => (
              <button
                type="button"
                role="radio"
                key={option.value}
                aria-checked={range === option.value}
                className={range === option.value ? 'active' : ''}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </header>
      <TrainingTimeStats time={time} />
    </section>
  );
}
