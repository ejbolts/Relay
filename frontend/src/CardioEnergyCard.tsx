import { useState } from 'react';
import { HelpPopup } from './HelpPopup';
import type { CardioEnergyPeriod } from './types';
import { fatEnergyEquivalent } from './cardioEnergy';
import { useWeightUnit } from './trainingPreferencesContext';
import { weightFromKg } from './weightUnits';

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

function comparison(current: number | null, previous: number | null, unit = ''): string {
  if (current === null || previous === null) return 'No prior comparison';
  const difference = current - previous;
  const decimals = ['bpm', 'g', 'kcal', 'm'].includes(unit) ? 0 : unit === 'lb' ? 2 : 1;
  const unchangedThreshold = 0.5 / 10 ** decimals;
  if (Math.abs(difference) < unchangedThreshold) return 'No change vs prior';
  const prefix = difference > 0 ? '↑' : '↓';
  return `${prefix} ${Math.abs(difference).toFixed(decimals)}${unit ? ` ${unit}` : ''} vs prior`;
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
  const previousDates =
    summary.previous_start_date && summary.previous_end_date
      ? `${prettyDate(summary.previous_start_date)} – ${prettyDate(summary.previous_end_date)}`
      : null;
  const previousCalories = summary.previous_calories_kcal ?? null;
  const caloriesComparison = comparison(summary.calories_kcal, previousCalories, 'kcal');
  const fatComparison = comparison(
    weightUnit === 'lb'
      ? weightFromKg(summary.calories_kcal / 7700, weightUnit)
      : (summary.calories_kcal / 7700) * 1000,
    previousCalories === null
      ? null
      : weightUnit === 'lb'
        ? weightFromKg(previousCalories / 7700, weightUnit)
        : (previousCalories / 7700) * 1000,
    weightUnit === 'lb' ? 'lb' : 'g',
  );
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
              Each metric uses the sessions where it was logged. Comparisons use the preceding
              period{previousDates ? ` (${previousDates})` : ''}. Fat energy equivalent is
              calculated from logged calories at 7,700 kcal per kilogram; it is not measured fat
              loss.
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
            <small className="cardio-progress-comparison">
              {averageMets === null
                ? 'No MET available'
                : comparison(averageMets, summary.previous_average_mets ?? null, 'MET')}
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
            <small className="cardio-progress-comparison">
              {elevationSessions === 0
                ? 'No elevation available'
                : comparison(elevation, summary.previous_elevation_gain_m ?? null, 'm')}
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
              {summary.total_sessions === 1 ? 'session' : 'sessions'} logged
            </small>
            <small className="cardio-progress-comparison">
              {caloriesRecorded ? caloriesComparison : 'No calories logged'}
            </small>
          </article>
          <article>
            <span>Fat energy equivalent</span>
            <strong>
              {caloriesRecorded
                ? `≈ ${fatEnergyEquivalent(summary.calories_kcal, weightUnit)}`
                : '—'}
            </strong>
            <small className="cardio-progress-comparison">
              {caloriesRecorded ? fatComparison : 'Not measured fat loss'}
            </small>
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
              {(summary.heart_rate_sessions ?? 0) === 1 ? 'session' : 'sessions'} logged
            </small>
            <small className="cardio-progress-comparison">
              {heartRate === null
                ? 'No heart rate logged'
                : comparison(heartRate, summary.previous_average_heart_rate_bpm ?? null, 'bpm')}
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
              {(summary.distance_sessions ?? 0) === 1 ? 'session' : 'sessions'} logged
            </small>
            <small className="cardio-progress-comparison">
              {(summary.distance_sessions ?? 0) === 0
                ? 'No distance logged'
                : comparison(distance, summary.previous_distance_km ?? null, 'km')}
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
              {(summary.speed_sessions ?? 0) === 1 ? 'session' : 'sessions'} logged
            </small>
            <small className="cardio-progress-comparison">
              {speed === null
                ? 'No speed logged'
                : comparison(speed, summary.previous_average_speed_kph ?? null, 'km/h')}
            </small>
          </article>
          <article>
            <span>Average incline</span>
            <strong>{incline === null ? '—' : `${incline.toFixed(1)}%`}</strong>
            <small>
              {summary.incline_sessions ?? 0}{' '}
              {(summary.incline_sessions ?? 0) === 1 ? 'session' : 'sessions'} logged
            </small>
            <small className="cardio-progress-comparison">
              {incline === null
                ? 'No incline logged'
                : comparison(incline, summary.previous_average_incline_percent ?? null, '%')}
            </small>
          </article>
        </div>
      </div>
    </section>
  );
}
