import { useState } from 'react';
import type { CardioOverview } from './types';
import { CardioEnergyCard } from './CardioEnergyCard';
import { cardioTrendWeeks } from './cardioTrend';
import { Icon } from './Icon';

const metrics = [
  { key: 'time', label: 'Time', unit: 'min' },
  { key: 'distance', label: 'Distance', unit: 'km' },
  { key: 'metMinutes', label: 'MET-min', unit: 'MET-min' },
  { key: 'calories', label: 'Calories', unit: 'kcal', suffix: 'burnt' },
] as const;
const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const shortDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function CardioTrendCard({ overview, today }: { overview: CardioOverview; today: string }) {
  const [metricKey, setMetricKey] = useState<(typeof metrics)[number]['key']>('time');
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const weeks = cardioTrendWeeks(overview.sessions, overview.current_week.week_start, today);
  const selected = weeks.slice(1).find((week) => week.start === selectedStart) ?? weeks[8];
  const previous = weeks[weeks.indexOf(selected) - 1];
  const metric = metrics.find((item) => item.key === metricKey)!;
  const value = selected[metricKey];
  const previousValue = previous[metricKey];
  const difference = value === null || previousValue === null ? null : value - previousValue;
  const maximum = Math.max(1, ...weeks.slice(1).map((week) => week[metricKey] ?? 0));

  return (
    <section className="pulse-card cardio-trend-card" aria-label="Weekly cardio trend">
      <div
        className="range-chips cardio-trend-metrics"
        role="group"
        aria-label="Cardio trend metric"
      >
        {metrics.map((item) => (
          <button
            key={item.key}
            type="button"
            className={metricKey === item.key ? 'active' : ''}
            aria-pressed={metricKey === item.key}
            onClick={() => setMetricKey(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div aria-live="polite" aria-atomic="true">
        <h2 className="cardio-trend-period">
          {selected.start === overview.current_week.week_start ? 'This week' : 'Week'} ·{' '}
          {shortDate(selected.start)} – {shortDate(selected.end)}
        </h2>
        <div className="cardio-week-value">
          {value === null ? '—' : format(value)}{' '}
          <small>{'suffix' in metric ? `${metric.unit} ${metric.suffix}` : metric.unit}</small>
        </div>
        <div className="cardio-week-comparison">
          {selected.sessions} {selected.sessions === 1 ? 'session' : 'sessions'}
          {difference !== null && (
            <>
              {' '}
              ·{' '}
              {Math.abs(difference) < 0.05
                ? 'No change'
                : `${difference > 0 ? '↑' : '↓'} ${format(Math.abs(difference))} ${metric.unit}`}{' '}
              vs previous week
            </>
          )}
        </div>
      </div>
      <div className="cardio-trend-chart" role="group" aria-label="Last eight weeks">
        {weeks.slice(1).map((week) => {
          const amount = week[metricKey];
          return (
            <button
              type="button"
              key={week.start}
              className="cardio-trend-week"
              aria-label={`Week of ${shortDate(week.start)}: ${amount === null ? 'not logged' : `${format(amount)} ${metric.unit}`}`}
              aria-pressed={selected.start === week.start}
              onClick={() => setSelectedStart(week.start)}
            >
              <span className="cardio-trend-bar-track">
                <i
                  className={amount === null ? 'unlogged' : ''}
                  style={{ height: `${Math.max(3, ((amount ?? 0) / maximum) * 100)}%` }}
                />
              </span>
              <span className="cardio-trend-week-label">{shortDate(week.start)}</span>
            </button>
          );
        })}
      </div>
      <dl className="cardio-week-stats" aria-live="polite" aria-atomic="true">
        <div>
          <dt>Avg HR</dt>
          <dd>
            {selected.heartRate === null ? (
              '—'
            ) : (
              <>
                {Math.round(selected.heartRate)} <small>bpm</small>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Avg METs</dt>
          <dd>{selected.mets === null ? '—' : selected.mets.toFixed(1)}</dd>
        </div>
        <div>
          <dt>{metricKey === 'time' ? 'Distance' : 'Time'}</dt>
          <dd>
            {metricKey === 'time' ? (
              selected.distance === null ? (
                '—'
              ) : (
                <>
                  {format(selected.distance)} <small>km</small>
                </>
              )
            ) : (
              <>
                {format(selected.time)} <small>min</small>
              </>
            )}
          </dd>
        </div>
      </dl>
      <details className="cardio-all-stats">
        <summary>
          All stats
          <Icon name="chevron-down" />
        </summary>
        <CardioEnergyCard
          summaries={overview.energy_periods}
          weekEnd={overview.current_week.week_end}
        />
      </details>
    </section>
  );
}
