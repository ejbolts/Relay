import type { CardioSession } from './types';
import { addDays, weekStartFor } from './trainingSummary';

export function cardioWeekTotals(sessions: CardioSession[], start: string, today: string) {
  const end = addDays(start, 6);
  const selected = sessions.filter(
    (s) => start <= s.session_date && s.session_date <= end && s.session_date <= today,
  );
  function total(field: 'distance_km' | 'calories_kcal' | 'average_mets') {
    const logged = selected.filter((s) => s[field] != null);
    return logged.length
      ? logged.reduce(
          (n, s) => n + s[field]! * (field === 'average_mets' ? s.duration_minutes : 1),
          0,
        )
      : null;
  }
  function average(field: 'average_mets' | 'average_heart_rate_bpm') {
    const logged = selected.filter((s) => s[field] != null);
    const minutes = logged.reduce((n, s) => n + s.duration_minutes, 0);
    // The API rounds duration-weighted averages to one decimal before display.
    return minutes > 0
      ? Number(
          (logged.reduce((n, s) => n + s[field]! * s.duration_minutes, 0) / minutes).toFixed(1),
        )
      : null;
  }
  return {
    start,
    end,
    sessions: selected.length,
    time: selected.reduce((n, s) => n + s.duration_minutes, 0),
    distance: total('distance_km'),
    calories: total('calories_kcal'),
    metMinutes: total('average_mets'),
    heartRate: average('average_heart_rate_bpm'),
    mets: average('average_mets'),
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
