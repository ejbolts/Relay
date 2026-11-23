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

/**
 * The goals a card tracks; a removed goal falls back to every goal. `zone` is the card's setting
 * (see `CardioGoalCardSettings` in homeLayout.ts): null tracks every goal.
 */
export function trackedCardioGoals<Settings extends { zone: number | null }>(
  goals: CardioGoalWeek[],
  settings: Settings,
) {
  const chosen = goals.filter((goal) => goal.zone === settings.zone);
  return chosen.length ? chosen : goals;
}

/** The line under Home's cardio goal card. */
export function cardioGoalStatus(goals: CardioGoalWeek[], daysLeft: number | null): string {
  if (!goals.length) return 'Set a weekly goal in Cardio';
  if (goals.every((goal) => goal.complete))
    return goals.length === 1 ? 'Weekly goal reached' : 'All goals reached';
  if (goals.length > 1)
    return `${goals.filter((goal) => goal.complete).length} of ${goals.length} goals reached`;
  const days = daysLeft === null ? '' : ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  return `${goals[0].remaining_minutes} min to go${days}`;
}

export interface ZoneDraft {
  zone: number;
  min: string;
  max: string;
}

export const CARDIO_ZONE_NUMBERS = [1, 2, 3, 4, 5];
export const CARDIO_ZONE_BPM = { min: 20, max: 250 };
export const CARDIO_MAX_HEART_RATE = { min: 100, max: 250 };
export const CARDIO_GOAL_MINUTES = { min: 1, max: 10_080 };

export function cardioZoneDrafts(preferences: CardioPreferences): ZoneDraft[] {
  return CARDIO_ZONE_NUMBERS.map((zone) => {
    const saved = preferences.heart_rate_zones.find((item) => item.zone === zone);
    return { zone, min: saved?.min_bpm.toString() ?? '', max: saved?.max_bpm.toString() ?? '' };
  });
}

export function validCardioInteger(value: number, { min, max }: { min: number; max: number }) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function parseCardioZoneRanges(zones: ZoneDraft[]) {
  if (zones.every(({ min, max }) => min === '' && max === '')) return [];
  if (zones.some(({ min, max }) => !min.trim() || !max.trim())) {
    throw new Error('Enter a minimum and maximum for all five zones.');
  }
  const ranges = zones.map(({ zone, min, max }) => ({
    zone,
    min_bpm: Number(min),
    max_bpm: Number(max),
  }));
  if (
    ranges.some(
      ({ min_bpm, max_bpm }) =>
        !validCardioInteger(min_bpm, CARDIO_ZONE_BPM) ||
        !validCardioInteger(max_bpm, CARDIO_ZONE_BPM),
    )
  ) {
    throw new Error('Enter whole heart rates from 20 to 250 bpm.');
  }
  if (
    ranges.some(
      ({ min_bpm, max_bpm }, index) =>
        min_bpm > max_bpm || (index > 0 && ranges[index - 1].max_bpm >= min_bpm),
    )
  ) {
    throw new Error('Zone ranges must increase without overlapping.');
  }
  return ranges;
}

/** Share of maximum heart rate where each of the five zones starts, then where zone 5 ends. */
const ZONE_BANDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];

/**
 * The standard five zones (50–60, 60–70, 70–80, 80–90 and 90–100% of maximum heart rate), each
 * starting one beat above the one before so they never overlap.
 */
export function zonesFromMaxHeartRate(maxBpm: number): ZoneDraft[] {
  const zones: ZoneDraft[] = [];
  for (let index = 0; index < 5; index += 1) {
    const min = index ? Number(zones[index - 1].max) + 1 : Math.round(maxBpm * ZONE_BANDS[0]);
    const max = index === 4 ? maxBpm : Math.round(maxBpm * ZONE_BANDS[index + 1]) - 1;
    zones.push({ zone: index + 1, min: String(min), max: String(max) });
  }
  return zones;
}

/**
 * A zone's "To" changed: the next zone's "From" follows one beat above, unless it was set to
 * something else by hand.
 */
export function withZoneMax(zones: ZoneDraft[], index: number, value: string): ZoneDraft[] {
  const next = zones[index + 1];
  const previousMax = Number(zones[index].max);
  const followsPrevious =
    next && (next.min === '' || (zones[index].max !== '' && Number(next.min) === previousMax + 1));
  const bpm = Number(value);
  return zones.map((item, row) => {
    if (row === index) return { ...item, max: value };
    if (row === index + 1 && followsPrevious && value !== '' && Number.isInteger(bpm) && bpm > 0)
      return { ...item, min: String(bpm + 1) };
    return item;
  });
}

/** Fields to mark: blanks once any range is entered, and bounds that overlap or run backwards. */
export function invalidZoneFields(zones: ZoneDraft[]): Set<string> {
  const invalid = new Set<string>();
  if (!zones.some((zone) => zone.min !== '' || zone.max !== '')) return invalid;
  zones.forEach((zone, index) => {
    if (!validCardioInteger(Number(zone.min), CARDIO_ZONE_BPM)) invalid.add(`${zone.zone}:min`);
    if (!validCardioInteger(Number(zone.max), CARDIO_ZONE_BPM)) invalid.add(`${zone.zone}:max`);
    if (zone.min !== '' && zone.max !== '' && Number(zone.min) > Number(zone.max)) {
      invalid.add(`${zone.zone}:min`);
      invalid.add(`${zone.zone}:max`);
    }
    const previous = zones[index - 1];
    if (previous?.max && zone.min !== '' && Number(previous.max) >= Number(zone.min)) {
      invalid.add(`${previous.zone}:max`);
      invalid.add(`${zone.zone}:min`);
    }
  });
  return invalid;
}
