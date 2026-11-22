import { fatEnergyEquivalent } from './cardioEnergy';
import { sessionElevation, sessionMets } from './cardioTrend';
import type { CardioSession } from './types';
import type { WeightUnit } from './weightUnits';

/** History pages hold whole weeks, so a week's sessions are never split across pages. */
export const CARDIO_HISTORY_WEEKS_PER_PAGE = 3;

export type CardioHistoryFilter = 'all' | 'pure_cardio' | 'workout_plus_cardio';

export const CARDIO_HISTORY_FILTERS: ReadonlyArray<readonly [CardioHistoryFilter, string]> = [
  ['all', 'All'],
  ['pure_cardio', 'Cardio only'],
  ['workout_plus_cardio', 'With workout'],
];

/** Whether a session was logged on its own or alongside a strength workout. */
export function cardioWorkoutContext(
  session: Pick<CardioSession, 'workout_context'>,
): Exclude<CardioHistoryFilter, 'all'> {
  return session.workout_context === 'workout_plus_cardio' ? 'workout_plus_cardio' : 'pure_cardio';
}

export function filterCardioHistory<T extends Pick<CardioSession, 'workout_context'>>(
  sessions: T[],
  filter: CardioHistoryFilter,
): T[] {
  return sessions.filter((session) => filter === 'all' || cardioWorkoutContext(session) === filter);
}

/** A history value, marked with ≈ when it was calculated rather than logged. */
export function estimatedMetric(value: number | null, estimated: boolean, unit: string) {
  if (value === null) return null;
  // Non-breaking spaces keep the sign, number and unit on one line.
  const amount = value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${estimated ? '≈\u00A0' : ''}${amount}\u00A0${unit}`;
}

/** "With Upper", the session's zone, or "Cardio only". */
export function cardioSessionContextLabel(
  session: Pick<CardioSession, 'workout_context' | 'source_workout_name' | 'zone'>,
): string {
  const workoutName = session.source_workout_name?.replace(/\s+workout$/i, '');
  return cardioWorkoutContext(session) === 'workout_plus_cardio'
    ? `With ${workoutName ?? 'workout'}`
    : (session.zone ?? 'Cardio only');
}

/** "320 kcal · ≈ 42 g fat burnt", or that calories were not logged. */
export function cardioSessionEnergy(
  session: Pick<CardioSession, 'calories_kcal'>,
  weightUnit: WeightUnit,
): string {
  return session.calories_kcal == null
    ? 'Calories not logged'
    : `${session.calories_kcal.toLocaleString()} kcal · ≈ ${fatEnergyEquivalent(session.calories_kcal, weightUnit)} fat burnt`;
}

/** Heart rate, distance, speed, incline, power, elevation and METs, as logged or estimated. */
export function cardioSessionPerformance(session: CardioSession): string {
  return (
    [
      session.average_heart_rate_bpm == null ? null : `${session.average_heart_rate_bpm} bpm avg`,
      session.distance_km == null ? null : `${session.distance_km} km`,
      session.average_speed_kph == null ? null : `${session.average_speed_kph} km/h avg`,
      session.incline_percent == null ? null : `${session.incline_percent}% incline`,
      session.average_power_watts == null ? null : `${session.average_power_watts} W avg`,
      estimatedMetric(sessionElevation(session), session.elevation_gain_m == null, 'm elevation'),
      estimatedMetric(sessionMets(session), session.average_mets == null, 'MET avg'),
    ]
      .filter((value): value is string => value !== null)
      .join(' · ') || 'Performance metrics not logged'
  );
}
