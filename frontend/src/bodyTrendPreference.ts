import {
  BODY_TREND_PREFERENCE_KEY,
  parseBodyTrendPreference,
  type BodyTrendPreference,
} from './bodyTrend';

export { DEFAULT_BODY_TREND_PREFERENCE, type BodyTrendPreference } from './bodyTrend';

export function loadBodyTrendPreference(): BodyTrendPreference {
  try {
    return parseBodyTrendPreference(window.localStorage.getItem(BODY_TREND_PREFERENCE_KEY));
  } catch {
    return parseBodyTrendPreference(null);
  }
}

export function saveBodyTrendPreference(preference: BodyTrendPreference): void {
  try {
    window.localStorage.setItem(BODY_TREND_PREFERENCE_KEY, JSON.stringify(preference));
  } catch {
    // Keep the in-memory preference usable if browser storage is unavailable.
  }
}
