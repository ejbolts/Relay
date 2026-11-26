import type { TrainingTime } from './types';
import { formatMinutesDuration } from './utils';

// Pure display rules matching TrainingTimeStats.tsx (shared with mobile/; switch the web
// component to import from here once #350 lands).

export const TRAINING_TIME_HELP_TITLE = 'Time trained';
export const TRAINING_TIME_HELP_BODY =
  "Totals use each workout's logged duration and every cardio session. Cardio done during a workout counts once in Combined.";

export const TRAINING_TIME_RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'year', label: 'Past year' },
] as const;

export type TrainingTimeRange = (typeof TRAINING_TIME_RANGES)[number]['value'];

export interface TrainingTimeStatItem {
  label: string;
  value: string;
  detail: string | null;
}

/** The totals to display for the chosen range, falling back to all time when past year is absent. */
export function trainingTimeForRange(
  allTime: TrainingTime,
  pastYear: TrainingTime | null | undefined,
  range: TrainingTimeRange,
): TrainingTime {
  return range === 'year' && pastYear ? pastYear : allTime;
}

/** Workouts, Cardio and Combined durations and counts, formatted as on the web profile card. */
export function trainingTimeStats(time: TrainingTime | null): TrainingTimeStatItem[] {
  const stats = [
    {
      label: 'Workouts',
      minutes: time?.workout_minutes,
      detail:
        time &&
        `${time.workout_count.toLocaleString('en-GB')} ${time.workout_count === 1 ? 'workout' : 'workouts'}`,
    },
    {
      label: 'Cardio',
      minutes: time?.cardio_minutes,
      detail:
        time &&
        `${time.cardio_count.toLocaleString('en-GB')} ${time.cardio_count === 1 ? 'session' : 'sessions'}`,
    },
    { label: 'Combined', minutes: time?.total_minutes, detail: time && 'All exercise' },
  ];
  return stats.map((stat) => ({
    label: stat.label,
    value: stat.minutes === undefined ? '–' : formatMinutesDuration(stat.minutes),
    detail: stat.detail ?? null,
  }));
}
