import { describe, expect, it } from 'vitest';
import { exerciseLastDoneDates, formatLastDone, lastDoneIsStale } from './exerciseLastDone';
import type { ExerciseHistoryBaseline, TrackedWorkout } from './types';

function workout(id: string, date: string, exerciseIds: string[]): TrackedWorkout {
  return {
    id,
    name: id,
    workout_date: date,
    category: 'push',
    notes: null,
    duration_minutes: null,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
    movements: exerciseIds.map(
      (exerciseId) => ({ exercise: { id: exerciseId } }) as TrackedWorkout['movements'][number],
    ),
  };
}

function baseline(exerciseId: string, workoutId: string, date: string): ExerciseHistoryBaseline {
  return {
    exercise_id: exerciseId,
    best_weight_kg: null,
    reps_by_weight: [],
    latest: {
      workout_id: workoutId,
      workout_date: date,
      workout_name: 'Older',
      movement_notes: null,
      sets: [],
    },
  };
}

describe('exerciseLastDoneDates', () => {
  it('keeps the latest date per exercise, whatever order the workouts arrive in', () => {
    const dates = exerciseLastDoneDates(
      [
        workout('w1', '2026-10-28', ['bench', 'row']),
        workout('w2', '2026-11-05', ['bench']),
        workout('w3', '2026-11-01', ['row']),
      ],
      null,
    );
    expect(Object.fromEntries(dates)).toEqual({ bench: '2026-11-05', row: '2026-11-01' });
  });

  it('falls back to condensed older history for exercises outside the loaded window', () => {
    const older = new Map([
      ['hack-squat', baseline('hack-squat', 'old-1', '2025-03-18')],
      ['bench', baseline('bench', 'old-2', '2026-08-01')],
      ['never', { ...baseline('never', 'x', '2026-01-01'), latest: null }],
    ]);
    const dates = exerciseLastDoneDates([workout('w1', '2026-11-05', ['bench'])], older);
    expect(Object.fromEntries(dates)).toEqual({ 'hack-squat': '2025-03-18', bench: '2026-11-05' });
  });

  it('ignores the workout currently being edited or resumed', () => {
    const dates = exerciseLastDoneDates(
      [workout('editing', '2026-11-07', ['bench']), workout('w1', '2026-11-02', ['bench', 'curl'])],
      new Map([['row', baseline('row', 'editing', '2026-09-01')]]),
      'editing',
    );
    expect(Object.fromEntries(dates)).toEqual({ bench: '2026-11-02', curl: '2026-11-02' });
  });
});

describe('formatLastDone', () => {
  it('shows day and month this year, and month and year before it', () => {
    expect(formatLastDone('2026-11-05', '2026-11-07', 'en-GB')).toBe('5 Nov');
    expect(formatLastDone('2025-03-18', '2026-11-07', 'en-GB')).toBe('Mar 2025');
  });
});

describe('lastDoneIsStale', () => {
  it('marks dates more than 30 days ago, including across a year boundary', () => {
    expect(lastDoneIsStale('2026-10-08', '2026-11-07')).toBe(false);
    expect(lastDoneIsStale('2026-10-07', '2026-11-07')).toBe(true);
    expect(lastDoneIsStale('2025-12-20', '2026-01-05')).toBe(false);
  });
});
