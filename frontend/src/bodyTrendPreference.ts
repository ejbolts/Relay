import type { BodyTrendDuration, BodyTrendStatistic } from './bodyTrend';
import { BODY_TREND_DURATION_OPTIONS } from './bodyTrend';

const BODY_TREND_PREFERENCE_KEY = 'gym-logger-body-trend';

export interface BodyTrendPreference {
  duration: BodyTrendDuration;
  statistic: BodyTrendStatistic;
}

export const DEFAULT_BODY_TREND_PREFERENCE: BodyTrendPreference = {
  duration: '30d',
  statistic: 'average',
};

function isDuration(value: unknown): value is BodyTrendDuration {
  return BODY_TREND_DURATION_OPTIONS.some((option) => option.value === value);
}

function isStatistic(value: unknown): value is BodyTrendStatistic {
  return value === 'average' || value === 'median';
}

export function loadBodyTrendPreference(): BodyTrendPreference {
  try {
    const saved = JSON.parse(window.localStorage.getItem(BODY_TREND_PREFERENCE_KEY) ?? 'null') as {
      duration?: unknown;
      statistic?: unknown;
    } | null;
    return {
      duration: isDuration(saved?.duration)
        ? saved.duration
        : DEFAULT_BODY_TREND_PREFERENCE.duration,
      statistic: isStatistic(saved?.statistic)
        ? saved.statistic
        : DEFAULT_BODY_TREND_PREFERENCE.statistic,
    };
  } catch {
    return DEFAULT_BODY_TREND_PREFERENCE;
  }
}

export function saveBodyTrendPreference(preference: BodyTrendPreference): void {
  try {
    window.localStorage.setItem(BODY_TREND_PREFERENCE_KEY, JSON.stringify(preference));
  } catch {
    // Keep the in-memory preference usable if browser storage is unavailable.
  }
}
