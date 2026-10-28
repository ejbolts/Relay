import type { CardioPreferences } from './types';

export const DEFAULT_CARDIO_PREFERENCES: CardioPreferences = {
  heart_rate_zones: [],
  goals: [{ zone: 2, minutes: 150 }],
};

export function cardioZoneNotice(
  heartRate: number | null | undefined,
  minutes: number,
  preferences: CardioPreferences,
): string {
  if (!preferences.heart_rate_zones.length)
    return 'Session saved. Set your heart-rate zones in Cardio to count zone goals.';
  if (heartRate == null)
    return 'Session saved. Add average heart rate to count it towards a zone goal.';
  const zone = preferences.heart_rate_zones.find(
    (range) => heartRate >= range.min_bpm && heartRate <= range.max_bpm,
  );
  if (!zone) return `Session saved. ${heartRate} bpm is outside your zone ranges; no goal credit.`;
  const goal = preferences.goals.find((item) => item.zone === zone.zone);
  return `Estimated Zone ${zone.zone} from ${heartRate} bpm average (${zone.min_bpm}–${zone.max_bpm} bpm). ${goal ? `${minutes} min towards your Zone ${zone.zone} goal.` : 'No goal set for this zone.'}`;
}
