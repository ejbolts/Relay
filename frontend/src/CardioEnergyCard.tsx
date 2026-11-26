import { useState } from 'react';
import { HelpPopup } from './HelpPopup';
import type { CardioEnergyPeriod } from './types';
import { CARDIO_ENERGY_PERIODS, cardioEnergyStats } from './cardioEnergy';
import { useWeightUnit } from './trainingPreferencesContext';

function prettyDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function CardioEnergyCard({
  summaries,
  weekEnd,
}: {
  summaries: CardioEnergyPeriod[] | undefined;
  weekEnd?: string;
}) {
  const weightUnit = useWeightUnit();
  const [period, setPeriod] = useState<CardioEnergyPeriod['period']>('week');
  const summary = summaries?.find((item) => item.period === period);
  if (!summary) return null;
  const metsSessions = summary.mets_sessions ?? 0;

  return (
    <section className="panel cardio-energy-card cardio-progress-card" aria-label="Cardio progress">
      <div className="pulse-card-header">
        <h2 className="profile-help-row">
          Progress{' '}
          <HelpPopup title="Cardio progress">
            <p>
              Average MET describes duration-weighted intensity. A session with no MET logged is
              estimated from its speed and incline, cycling power and body weight, or calories and
              body weight, otherwise from a typical value for the activity. Elevation gain left
              blank is calculated from incline and distance.
            </p>
            <p>
              Only sessions through {prettyDate(summary.end_date)} count; future sessions are
              excluded.
            </p>
            <p>
              Each metric uses the sessions where it was logged. Fat energy equivalent is calculated
              from logged calories at 7,700 kcal per kilogram; it is not measured fat loss.
            </p>
            <p>
              {summary.logged_sessions} of {summary.total_sessions}{' '}
              {summary.total_sessions === 1 ? 'session has' : 'sessions have'} calories logged.{' '}
              {metsSessions} {metsSessions === 1 ? 'session has' : 'sessions have'} a MET value.
            </p>
          </HelpPopup>
        </h2>
      </div>
      <div className="cardio-progress-content">
        <div
          className="segmented-control cardio-energy-periods"
          role="group"
          aria-label="Cardio progress period"
        >
          {CARDIO_ENERGY_PERIODS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={period === item.value}
              onClick={() => setPeriod(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="cardio-progress-dates">
          <strong>
            {prettyDate(summary.start_date)} –{' '}
            {prettyDate(period === 'week' ? (weekEnd ?? summary.end_date) : summary.end_date)}
          </strong>
        </div>
        <div className="cardio-progress-grid" aria-live="polite" aria-atomic="true">
          {cardioEnergyStats(summary, weightUnit).map(({ label, value, unit, count }) => (
            <article key={label}>
              <span>{label}</span>
              <strong>
                {value}
                {unit && (
                  <>
                    {' '}
                    <small className="cardio-stat-unit">{unit}</small>
                  </>
                )}
              </strong>
              {count && <small>{count}</small>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
