/**
 * Cardio personal records, kept per exercise like strength records. Mirrors the server's
 * cardio_records.py:
 *
 * - Distance PR: the longest distance in one set.
 * - Duration PR: the longest set.
 * - Pace PR: the fastest time over one of the exercise's set distances, from a set's average
 *   pace. A 7.2 km run in 36:00 covers 5 km in 25:00, so only sets at least that long count.
 *
 * The set distances suit the sport, matched by the exercise's name. First attempts establish
 * each baseline.
 */
import type { CardioBests, PersonalRecord, WorkoutSetInput } from './types';
import { recordScopeLabel } from './recordScope';
import { formatSeconds } from './utils';

export const RUNNING_DISTANCES = [1, 5, 10, 21.0975, 42.195];
export const ROWING_DISTANCES = [0.5, 2, 5, 10];
export const CYCLING_DISTANCES = [10, 20, 40, 100];
export const SWIMMING_DISTANCES = [0.1, 0.4, 0.8, 1.5];
export const OTHER_DISTANCES = [1, 5, 10];

// Checked in order, so an indoor walking exercise is not read as rowing or cycling.
const SPORT_DISTANCES: Array<[string[], number[]]> = [
  [['swim'], SWIMMING_DISTANCES],
  [['row'], ROWING_DISTANCES],
  [['cycl', 'bike', 'biking', 'spin'], CYCLING_DISTANCES],
  [['run', 'jog', 'walk', 'hike', 'treadmill'], RUNNING_DISTANCES],
];

/** The set distances, in km and shortest first, an exercise's pace records use. */
export function paceDistances(exerciseName: string): number[] {
  const name = exerciseName.toLocaleLowerCase('en');
  return (
    SPORT_DISTANCES.find(([words]) => words.some((word) => name.includes(word)))?.[1] ??
    OTHER_DISTANCES
  );
}

/** A completed set that is not a warm-up, as for strength records. */
export function isCardioRecordEligible(
  item: Pick<WorkoutSetInput, 'completed' | 'warmup' | 'set_type'>,
): boolean {
  return item.completed && !item.warmup && item.set_type !== 'warmup';
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** Distances compare to the metre. */
export const recordDistance = (distanceKm: number) => round(distanceKm, 3);

/** A set's time over a shorter set distance at its average pace, to a tenth of a second. */
export const timeOver = (durationSeconds: number, distanceKm: number, targetKm: number) =>
  round((durationSeconds * targetKm) / distanceKm, 1);

/** One exercise's bests so far; -1 until a first attempt sets the baseline. */
export interface CardioBestsState {
  distance: number;
  duration: number;
  /** Fastest seconds over each set distance (km) reached so far. */
  times: Map<number, number>;
}

export function cardioBestsFrom(baseline?: CardioBests | null): CardioBestsState {
  return {
    distance: baseline?.best_distance_km ?? -1,
    duration: baseline?.best_duration_seconds ?? -1,
    times: new Map((baseline?.best_times ?? []).map((item) => [item.distance_km, item.seconds])),
  };
}

export type CardioRecordHit =
  { type: 'distance' | 'duration' } | { type: 'pace'; distanceKm: number };

/** Counts a set into the bests, returning the records it beat. */
export function addCardioSet(
  bests: CardioBestsState,
  durationSeconds: number | null | undefined,
  distanceKm: number | null | undefined,
  distances: number[],
): CardioRecordHit[] {
  const hits: CardioRecordHit[] = [];
  const duration = durationSeconds && durationSeconds > 0 ? durationSeconds : null;
  const distance = distanceKm && distanceKm > 0 ? recordDistance(distanceKm) : null;
  if (distance !== null) {
    if (bests.distance >= 0 && distance > bests.distance) hits.push({ type: 'distance' });
    bests.distance = Math.max(bests.distance, distance);
  }
  if (duration !== null) {
    if (bests.duration >= 0 && duration > bests.duration) hits.push({ type: 'duration' });
    bests.duration = Math.max(bests.duration, duration);
  }
  if (distance !== null && duration !== null) {
    for (const target of distances) {
      if (distance < target) break;
      const time = timeOver(duration, distanceKm!, target);
      const best = bests.times.get(target);
      if (best !== undefined && time < best) hits.push({ type: 'pace', distanceKm: target });
      bests.times.set(target, best === undefined ? time : Math.min(best, time));
    }
  }
  return hits;
}

/** A set distance as people say it: 500 m, 5 km, 21.1 km. */
export function formatRecordDistance(distanceKm: number): string {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m`
    : `${Number(distanceKm.toFixed(1))} km`;
}

/** A record time: tenths of a second only under ten minutes, where they matter. */
export function formatRecordTime(seconds: number): string {
  const tenths = seconds < 600 && Math.round(seconds * 10) % 10 !== 0;
  if (!tenths) return formatSeconds(Math.round(seconds));
  const total = Math.round(seconds * 10);
  return `${formatSeconds(Math.floor(total / 10))}.${total % 10}`;
}

export function cardioHitLabel(hit: CardioRecordHit): string {
  if (hit.type === 'pace') return `Fastest ${formatRecordDistance(hit.distanceKm)}`;
  return hit.type === 'distance' ? 'Distance PR' : 'Duration PR';
}

/** A cardio record's name, or null for a strength record. */
export function cardioRecordLabel(
  record: Pick<PersonalRecord, 'record_type' | 'normalized_weight'>,
): string | null {
  if (record.record_type === 'pace') {
    return record.normalized_weight != null
      ? cardioHitLabel({ type: 'pace', distanceKm: record.normalized_weight })
      : 'Pace PR';
  }
  if (record.record_type === 'distance' || record.record_type === 'duration')
    return cardioHitLabel({ type: record.record_type });
  return null;
}

/** What a cardio set covered, such as “7.2 km in 36:00”. */
export function cardioSetSummary(
  durationSeconds: number | null | undefined,
  distanceKm: number | null | undefined,
): string {
  const time = durationSeconds && durationSeconds > 0 ? formatSeconds(durationSeconds) : null;
  const distance = distanceKm && distanceKm > 0 ? `${Number(distanceKm.toFixed(2))} km` : null;
  if (time && distance) return `${distance} in ${time}`;
  return distance ?? time ?? '';
}

/** A cardio record's value: a distance, a duration or the time over its set distance. */
export function cardioRecordValue(record: Pick<PersonalRecord, 'value' | 'unit'>): string {
  return record.unit === 'km'
    ? `${Number(record.value.toFixed(2))} km`
    : formatRecordTime(record.value);
}

const lowerFirst = (label: string) => `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
const CARDIO_ORDER: Partial<Record<PersonalRecord['record_type'], number>> = {
  distance: 0,
  duration: 1,
  pace: 2,
};

/**
 * A just-saved cardio session's records for its celebrate toast, one line each with its value,
 * named as the logger names them: “All-time fastest 5 km”. Null when it set none.
 */
export function savedCardioRecordsToast(records: PersonalRecord[]) {
  const cardio = records
    .filter((record) => cardioRecordLabel(record) !== null)
    .sort(
      (left, right) =>
        (CARDIO_ORDER[left.record_type] ?? 3) - (CARDIO_ORDER[right.record_type] ?? 3) ||
        (left.normalized_weight ?? 0) - (right.normalized_weight ?? 0),
    );
  if (!cardio.length) return null;
  const lines = cardio.map((record) => ({
    title: `${recordScopeLabel(record)} ${lowerFirst(cardioRecordLabel(record)!)}`,
    detail: [record.exercise_name, cardioRecordValue(record)].filter(Boolean).join(' · '),
  }));
  return { message: lines.map((line) => line.title).join(', '), lines };
}
