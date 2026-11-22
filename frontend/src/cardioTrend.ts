import type { CardioSession } from './types';
import { addDays, weekStartFor } from './trainingSummary';

type SessionEstimates = Pick<
  CardioSession,
  'average_mets' | 'estimated_mets' | 'elevation_gain_m' | 'estimated_elevation_gain_m'
>;

/** The logged average MET, or the server's estimate when it was left blank. */
export const sessionMets = (session: SessionEstimates) =>
  session.average_mets ?? session.estimated_mets ?? null;

/** The logged elevation gain, or the estimate from incline and distance. */
export const sessionElevation = (session: SessionEstimates) =>
  session.elevation_gain_m ?? session.estimated_elevation_gain_m ?? null;

export function cardioWeekTotals(sessions: CardioSession[], start: string, today: string) {
  const end = addDays(start, 6);
  const selected = sessions.filter(
    (s) => start <= s.session_date && s.session_date <= end && s.session_date <= today,
  );
  function total(read: (session: CardioSession) => number | null | undefined) {
    const logged = selected.filter((s) => read(s) != null);
    return logged.length ? logged.reduce((n, s) => n + read(s)!, 0) : null;
  }
  function average(read: (session: CardioSession) => number | null | undefined) {
    const logged = selected.filter((s) => read(s) != null);
    const minutes = logged.reduce((n, s) => n + s.duration_minutes, 0);
    // The API rounds duration-weighted averages to one decimal before display.
    return minutes > 0
      ? Number((logged.reduce((n, s) => n + read(s)! * s.duration_minutes, 0) / minutes).toFixed(1))
      : null;
  }
  return {
    start,
    end,
    sessions: selected.length,
    time: selected.reduce((n, s) => n + s.duration_minutes, 0),
    distance: total((s) => s.distance_km),
    calories: total((s) => s.calories_kcal),
    elevation: total(sessionElevation),
    heartRate: average((s) => s.average_heart_rate_bpm),
    mets: average(sessionMets),
  };
}

export function cardioTrendWeeks(sessions: CardioSession[], currentStart: string, today: string) {
  // Keep one extra preceding week for the oldest visible bar's comparison.
  return Array.from({ length: 9 }, (_, index) =>
    cardioWeekTotals(sessions, addDays(currentStart, (index - 8) * 7), today),
  );
}

export interface CardioDistanceGroup {
  key: string;
  label: string;
  sessions: number;
  distance: number;
}

// Distances are only comparable within one kind of movement: a 5 km run and a
// 20 km ride should not be added together. Walking and running share a group.
const distanceKinds = [
  {
    key: 'foot',
    label: 'Walk & run',
    pattern: /\b(run|running|jog|jogging|walk|walking|hike|hiking|treadmill)\b/,
  },
  { key: 'cycle', label: 'Cycling', pattern: /(cycl|bike|spin)/ },
  { key: 'row', label: 'Rowing', pattern: /\brow(ing|er)?\b/ },
  { key: 'swim', label: 'Swimming', pattern: /\bswim/ },
] as const;

export function distanceGroupFor(activity: string): { key: string; label: string } {
  const name = activity.trim().toLocaleLowerCase();
  const kind = distanceKinds.find((item) => item.pattern.test(name));
  return kind
    ? { key: kind.key, label: kind.label }
    : { key: `activity:${name}`, label: activity.trim() };
}

/** Activity groups with distance logged between `start` and `end`, most used first. */
export function cardioDistanceGroups(
  sessions: CardioSession[],
  start: string,
  end: string,
): CardioDistanceGroup[] {
  const groups = new Map<string, CardioDistanceGroup>();
  for (const session of sessions) {
    if (session.distance_km == null || session.session_date < start || session.session_date > end)
      continue;
    const { key, label } = distanceGroupFor(session.activity_type);
    const group = groups.get(key) ?? { key, label, sessions: 0, distance: 0 };
    group.sessions += 1;
    group.distance += session.distance_km;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.sessions - a.sessions || b.distance - a.distance || a.label.localeCompare(b.label),
  );
}

// Always offered as Distance tabs, even before any distance is logged for them.
const standardDistanceKinds = new Set(['foot', 'cycle', 'row']);

/**
 * Distance tabs: logged groups (most used first), then any standard kind with
 * no distance logged yet, so Walk & run, Cycling and Rowing are always available.
 */
export function cardioDistanceTabs(
  sessions: CardioSession[],
  start: string,
  end: string,
): CardioDistanceGroup[] {
  const groups = cardioDistanceGroups(sessions, start, end);
  const missing = distanceKinds
    .filter((kind) => standardDistanceKinds.has(kind.key))
    .filter((kind) => !groups.some((group) => group.key === kind.key))
    .map((kind) => ({ key: kind.key, label: kind.label, sessions: 0, distance: 0 }));
  return [...groups, ...missing];
}

export function groupCardioHistory(sessions: CardioSession[], weekStartDay: number) {
  const groups = new Map<string, CardioSession[]>();
  for (const session of sessions) {
    const start = weekStartFor(session.session_date, weekStartDay);
    const group = groups.get(start) ?? [];
    group.push(session);
    groups.set(start, group);
  }
  return [...groups]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([start, items]) => ({ start, sessions: items }));
}

/** The weekly trend card's metrics: what each charts and its unit. */
export const CARDIO_TREND_METRICS = [
  { key: 'time', label: 'Time', unit: 'min' },
  { key: 'distance', label: 'Distance', unit: 'km' },
  { key: 'elevation', label: 'Elevation', unit: 'm' },
  { key: 'calories', label: 'Calories', unit: 'kcal', suffix: 'burnt' },
] as const;

export type CardioTrendMetricKey = (typeof CARDIO_TREND_METRICS)[number]['key'];

export const formatCardioAmount = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 1 });

/**
 * What the weekly trend card shows: the last eight weeks (plus the week before, for comparison),
 * the selected week (the newest unless another was picked) against the one before it, and the
 * Distance tab's activity group, since distances only add up within one kind of movement.
 */
export function cardioTrendSelection(
  sessions: CardioSession[],
  currentStart: string,
  today: string,
  metricKey: CardioTrendMetricKey,
  selectedStart: string | null,
  distanceKey: string | null,
) {
  const allWeeks = cardioTrendWeeks(sessions, currentStart, today);
  const distanceGroups = cardioDistanceTabs(sessions, allWeeks[1].start, today);
  const distanceGroup =
    distanceGroups.find((group) => group.key === distanceKey) ?? distanceGroups[0] ?? null;
  const distanceWeeks = distanceGroup
    ? cardioTrendWeeks(
        sessions.filter(
          (session) => distanceGroupFor(session.activity_type).key === distanceGroup.key,
        ),
        currentStart,
        today,
      )
    : allWeeks;
  const weeks = metricKey === 'distance' ? distanceWeeks : allWeeks;
  const found = weeks.findIndex((week, i) => i > 0 && week.start === selectedStart);
  const index = found > 0 ? found : 8;
  const selected = weeks[index];
  const previous = weeks[index - 1];
  const value = selected[metricKey];
  const previousValue = previous[metricKey];
  return {
    weeks,
    distanceGroups,
    distanceGroup,
    selected,
    selectedDistance: distanceWeeks[index].distance,
    metric: CARDIO_TREND_METRICS.find((item) => item.key === metricKey)!,
    value,
    difference: value === null || previousValue === null ? null : value - previousValue,
    maximum: Math.max(1, ...weeks.slice(1).map((week) => week[metricKey] ?? 0)),
  };
}
