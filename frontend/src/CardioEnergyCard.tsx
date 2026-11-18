import { useState } from 'react';
import { HelpPopup } from './HelpPopup';
import type { CardioEnergyPeriod } from './types';
import { fatEnergyEquivalent } from './cardioEnergy';
import { useWeightUnit } from './trainingPreferencesContext';

const periods: { value: CardioEnergyPeriod['period']; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
];

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
  const caloriesRecorded = summary.logged_sessions > 0;
  const heartRate = summary.average_heart_rate_bpm ?? null;
  const distance = summary.distance_km ?? 0;
  const speed = summary.average_speed_kph ?? null;
  const incline = summary.average_incline_percent ?? null;
  const averageMets = summary.average_mets ?? null;
  const metsSessions = summary.mets_sessions ?? 0;
  const elevation = summary.elevation_gain_m ?? 0;
  const elevationSessions = summary.elevation_sessions ?? 0;

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
          {periods.map((item) => (
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
          <article>
            <span>Average MET</span>
            <strong>{averageMets === null ? '—' : averageMets.toFixed(1)}</strong>
            <small>
              {metsSessions} {metsSessions === 1 ? 'session' : 'sessions'}
            </small>
          </article>
          <article>
            <span>Elevation gain</span>
            <strong>
              {elevationSessions === 0 ? (
                '—'
              ) : (
                <>
                  {Math.round(elevation).toLocaleString()}{' '}
                  <small className="cardio-stat-unit">m</small>
                </>
              )}
            </strong>
            <small>
              {elevationSessions} {elevationSessions === 1 ? 'session' : 'sessions'}
            </small>
          </article>
          <article>
            <span>Calories</span>
            <strong>
              {caloriesRecorded ? (
                <>
                  {summary.calories_kcal.toLocaleString()}{' '}
                  <small className="cardio-stat-unit">kcal</small>
                </>
              ) : (
                '—'
              )}
            </strong>
            <small>
              {summary.logged_sessions} of {summary.total_sessions}{' '}
              {summary.total_sessions === 1 ? 'session' : 'sessions'}
            </small>
          </article>
          <article>
            <span>Fat energy equivalent</span>
            <strong>
              {caloriesRecorded
                ? `≈ ${fatEnergyEquivalent(summary.calories_kcal, weightUnit)}`
                : '—'}
            </strong>
          </article>
          <article>
            <span>Average HR</span>
            <strong>
              {heartRate === null ? (
                '—'
              ) : (
                <>
                  {heartRate.toFixed(0)} <small className="cardio-stat-unit">bpm</small>
                </>
              )}
            </strong>
            <small>
              {summary.heart_rate_sessions ?? 0}{' '}
              {(summary.heart_rate_sessions ?? 0) === 1 ? 'session' : 'sessions'}
            </small>
          </article>
          <article>
            <span>Distance</span>
            <strong>
              {(summary.distance_sessions ?? 0) === 0 ? (
                '—'
              ) : (
                <>
                  {distance.toFixed(2)} <small className="cardio-stat-unit">km</small>
                </>
              )}
            </strong>
            <small>
              {summary.distance_sessions ?? 0}{' '}
              {(summary.distance_sessions ?? 0) === 1 ? 'session' : 'sessions'}
            </small>
          </article>
          <article>
            <span>Average speed</span>
            <strong>
              {speed === null ? (
                '—'
              ) : (
                <>
                  {speed.toFixed(1)} <small className="cardio-stat-unit">km/h</small>
                </>
              )}
            </strong>
            <small>
              {summary.speed_sessions ?? 0}{' '}
              {(summary.speed_sessions ?? 0) === 1 ? 'session' : 'sessions'}
            </small>
          </article>
          <article>
            <span>Average incline</span>
            <strong>{incline === null ? '—' : `${incline.toFixed(1)}%`}</strong>
            <small>
              {summary.incline_sessions ?? 0}{' '}
              {(summary.incline_sessions ?? 0) === 1 ? 'session' : 'sessions'}
            </small>
          </article>
        </div>
      </div>
    </section>
  );
}
