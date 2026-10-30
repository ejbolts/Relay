import type { CardioGoalCardSettings } from './homeLayout';
import type { CardioGoalWeek, CardioPreferences, CardioSession } from './types';

export const DEFAULT_CARDIO_PREFERENCES: CardioPreferences = {
  heart_rate_zones: [],
  goals: [{ zone: 2, minutes: 150 }],
};

export function cardioZoneNotice(
  session: Pick<CardioSession, 'zone' | 'average_heart_rate_bpm' | 'duration_minutes'>,
  preferences: CardioPreferences,
): string {
  const zone = Number(session.zone?.replace('Zone ', '')) || null;
  const credit = () =>
    preferences.goals.some((goal) => goal.zone === zone)
      ? `${session.duration_minutes} min added to your Zone ${zone} goal.`
      : `No goal set for Zone ${zone}.`;
  const heartRate = session.average_heart_rate_bpm;
  if (!preferences.heart_rate_zones.length)
    return zone
      ? `Logged as Zone ${zone}. ${credit()} Set heart-rate zones to classify by heart rate.`
      : 'Session saved. Set heart-rate zones to classify by heart rate.';
  if (heartRate == null) return 'Session saved without heart rate, so no zone goal credit.';
  const range = preferences.heart_rate_zones.find((item) => item.zone === zone);
  if (!zone || !range)
    return `Session saved. ${heartRate} bpm is outside your zones, so no goal credit.`;
  return `Zone ${zone} · ${heartRate} bpm average (${range.min_bpm}–${range.max_bpm} bpm). ${credit()}`;
}

/** The goals a card tracks; a removed goal falls back to every goal. */
export function trackedCardioGoals(goals: CardioGoalWeek[], settings: CardioGoalCardSettings) {
  const chosen = goals.filter((goal) => goal.zone === settings.zone);
  return chosen.length ? chosen : goals;
}
