import { describe, expect, it } from 'vitest';
import { blockEndedLabel, blockWeekLabel, homeBlockCard } from './trainingBlockHome';
import { addDays } from './trainingSummary';
import type { TrackedWorkout, TrainingBlock } from './types';

const TODAY = '2026-11-18';
const weekly = (weeks: number, sample = false) =>
  Array.from(
    { length: weeks },
    (_, index) =>
      ({ workout_date: addDays('2026-11-16', -index * 7), is_sample: sample }) as TrackedWorkout,
  );
const running = { id: 'b', name: 'Winter', start_date: '2026-11-02', end_date: null };
const state = (blocks: TrainingBlock[], workouts: TrackedWorkout[], extra = {}) =>
  homeBlockCard({
    blocks,
    loading: false,
    error: false,
    workouts,
    today: TODAY,
    weekStartDay: 1,
    ...extra,
  });

describe('Home’s training block card', () => {
  it('shows the running block however little has been trained', () => {
    expect(state([running], [])).toEqual({ kind: 'block', block: running });
  });

  it('offers the first block after four weeks of the person’s own training', () => {
    expect(state([], weekly(3))).toBeNull();
    expect(state([], weekly(6, true))).toBeNull();
    expect(state([], weekly(4))).toEqual({ kind: 'offer' });
    expect(state([], weekly(4), { loading: true })).toBeNull();
    expect(state([], weekly(4), { error: true })).toBeNull();
  });

  it('leaves the offer off once any block exists', () => {
    const later = { ...running, start_date: '2026-12-01' };
    expect(state([later], weekly(8))).toBeNull();
  });

  it('labels the week, against the planned length when there is one', () => {
    expect(blockWeekLabel(running, TODAY)).toBe('Week 3 · since 2 Nov');
    expect(blockWeekLabel({ ...running, start_date: '2025-12-29' }, TODAY)).toBe(
      'Week 47 · since 29 Dec 2025',
    );
    const planned = { ...running, planned_end_date: '2026-12-27' };
    expect(blockWeekLabel(planned, TODAY)).toBe('Week 3 of 8');
    expect(blockWeekLabel({ ...planned, planned_end_date: '2026-11-15' }, TODAY)).toBe(
      'Week 3 · planned 2',
    );
    expect(blockEndedLabel({ ...planned, planned_end_date: '2026-11-15' }, TODAY)).toBe(
      '2 weeks · ended 15 Nov',
    );
  });
});
