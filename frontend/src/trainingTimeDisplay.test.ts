import { describe, expect, it } from 'vitest';
import {
  TRAINING_TIME_RANGES,
  trainingTimeForRange,
  trainingTimeStats,
} from './trainingTimeDisplay';
import type { TrainingTime } from './types';

const ALL_TIME: TrainingTime = {
  workout_minutes: 125,
  workout_count: 2,
  cardio_minutes: 45,
  cardio_count: 1,
  total_minutes: 150,
};

const PAST_YEAR: TrainingTime = {
  workout_minutes: 60,
  workout_count: 1,
  cardio_minutes: 90,
  cardio_count: 3,
  total_minutes: 150,
};

describe('trainingTimeDisplay', () => {
  it('formats durations and singular/plural counts', () => {
    expect(trainingTimeStats(ALL_TIME)).toEqual([
      { label: 'Workouts', value: '2h 5min', detail: '2 workouts' },
      { label: 'Cardio', value: '45min', detail: '1 session' },
      { label: 'Combined', value: '2h 30min', detail: 'All exercise' },
    ]);
    expect(trainingTimeStats(PAST_YEAR)).toEqual([
      { label: 'Workouts', value: '1h', detail: '1 workout' },
      { label: 'Cardio', value: '1h 30min', detail: '3 sessions' },
      { label: 'Combined', value: '2h 30min', detail: 'All exercise' },
    ]);
  });

  it('shows dashes without detail when totals are null', () => {
    expect(trainingTimeStats(null)).toEqual([
      { label: 'Workouts', value: '–', detail: null },
      { label: 'Cardio', value: '–', detail: null },
      { label: 'Combined', value: '–', detail: null },
    ]);
  });

  it('uses past year only when selected and provided', () => {
    expect(TRAINING_TIME_RANGES.map((option) => option.label)).toEqual(['All time', 'Past year']);
    expect(trainingTimeForRange(ALL_TIME, PAST_YEAR, 'all')).toBe(ALL_TIME);
    expect(trainingTimeForRange(ALL_TIME, PAST_YEAR, 'year')).toBe(PAST_YEAR);
    expect(trainingTimeForRange(ALL_TIME, null, 'year')).toBe(ALL_TIME);
    expect(trainingTimeForRange(ALL_TIME, undefined, 'year')).toBe(ALL_TIME);
  });
});
