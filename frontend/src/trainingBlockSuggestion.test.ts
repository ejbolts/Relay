import { describe, expect, it } from 'vitest';
import {
  blockSuggestion,
  blockSuggestionLabel,
  goalDirectionChangedOn,
  trainedWeeks,
} from './trainingBlockSuggestion';
import { addDays } from './trainingSummary';
import type { BodyWeightGoal, PersonalRecord, TrackedWorkout, TrainingBlock } from './types';

const TODAY = '2026-11-18';
const workout = (date: string, sample = false) =>
  ({ workout_date: date, is_sample: sample }) as TrackedWorkout;
const record = (date: string, scope: 'all_time' | 'block' = 'all_time') =>
  ({ achieved_date: date, scope }) as PersonalRecord;
const block = (start: string) =>
  ({ id: start, name: 'Block', start_date: start, end_date: null }) as TrainingBlock;
const goal = (created: string, start: number, target: number, range?: [number, number]) =>
  ({
    created_at: `${created}T08:00:00Z`,
    start_weight_kg: start,
    target_weight_kg: target,
    maintenance_min_kg: range?.[0] ?? null,
    maintenance_max_kg: range?.[1] ?? null,
  }) as BodyWeightGoal;

/** Monday and Tuesday sessions for each of the weeks ending with this one. */
const steady = (weeks: number) =>
  Array.from({ length: weeks }, (_, index) => {
    const monday = addDays('2026-11-16', -index * 7);
    return [workout(monday), workout(addDays(monday, 1))];
  }).flat();

const suggest = (overrides: Partial<Parameters<typeof blockSuggestion>[0]>) =>
  blockSuggestion({ workouts: [], records: [], blocks: [], today: TODAY, ...overrides });

describe('blockSuggestion', () => {
  it('waits for four weeks of training before offering a first block', () => {
    expect(suggest({ workouts: steady(3) })).toBeNull();
    expect(suggest({ workouts: steady(5) })).toEqual({ reason: 'no-block', weeks: 5 });
    // Sample workouts are not the person's own training.
    expect(
      suggest({ workouts: steady(5).map((item) => ({ ...item, is_sample: true })) }),
    ).toBeNull();
  });

  it('says nothing more once a block exists, unless there is a reason for a new one', () => {
    expect(suggest({ workouts: steady(8), blocks: [block('2026-09-01')] })).toBeNull();
  });

  it('notices a return from ten or more days off', () => {
    const workouts = [workout('2026-10-20'), workout('2026-11-02'), workout('2026-11-16')];
    // The latest break is 3 to 15 November: thirteen days without training.
    expect(suggest({ workouts, blocks: [block('2026-08-01')] })).toEqual({
      reason: 'returning',
      days: 13,
    });
    // Training on the 6th and the 17th leaves ten days off; the 7th leaves nine.
    const blocks = [block('2026-08-01')];
    expect(suggest({ workouts: [workout('2026-11-06'), workout('2026-11-17')], blocks })).toEqual({
      reason: 'returning',
      days: 10,
    });
    expect(
      suggest({ workouts: [workout('2026-11-07'), workout('2026-11-17')], blocks }),
    ).toBeNull();
    // A return that is itself more than two weeks old is no longer the moment.
    expect(
      suggest({
        workouts: [workout('2026-10-01'), workout('2026-10-20')],
        blocks: [block('2026-08-01')],
      }),
    ).toBeNull();
  });

  it('notices records drying up while training continues', () => {
    const records = ['2026-10-10', '2026-10-14', '2026-10-20'].map((date) => record(date));
    const blocks = [block('2026-08-01')];
    expect(suggest({ workouts: steady(8), records, blocks })).toEqual({
      reason: 'stalled',
      weeks: 3,
    });
    // One record in the last three weeks, or block-only records before, is not a stall.
    expect(
      suggest({ workouts: steady(8), records: [...records, record('2026-11-10')], blocks }),
    ).toBeNull();
    expect(
      suggest({
        workouts: steady(8),
        records: records.map((item) => ({ ...item, scope: 'block' as const })),
        blocks,
      }),
    ).toBeNull();
    // Not training is a break, not a stall.
    expect(suggest({ workouts: [workout('2026-11-16')], records, blocks })).toBeNull();
  });

  it('notices a weight goal that changed direction in the last two weeks', () => {
    const blocks = [block('2026-08-01')];
    expect(suggest({ workouts: steady(8), blocks, goalChangedOn: '2026-11-10' })).toEqual({
      reason: 'new-goal',
    });
    expect(suggest({ workouts: steady(8), blocks, goalChangedOn: '2026-10-01' })).toBeNull();
  });

  it('suggests nothing on top of a block started in the last three weeks', () => {
    expect(
      suggest({
        workouts: [workout('2026-10-20'), workout('2026-11-16')],
        blocks: [block('2026-11-10')],
        goalChangedOn: '2026-11-12',
      }),
    ).toBeNull();
  });

  it('prefers the return, then the new goal, then the stall', () => {
    const records = ['2026-10-10', '2026-10-14', '2026-10-20'].map((date) => record(date));
    const away = [
      ...steady(8).filter((item) => item.workout_date < '2026-11-02'),
      workout('2026-11-17'),
    ];
    expect(suggest({ workouts: away, records, goalChangedOn: '2026-11-12' })?.reason).toBe(
      'returning',
    );
    expect(suggest({ workouts: steady(8), records, goalChangedOn: '2026-11-12' })?.reason).toBe(
      'new-goal',
    );
  });
});

describe('supporting helpers', () => {
  it('counts weeks that hold the person’s own workouts', () => {
    expect(
      trainedWeeks([
        workout('2026-11-16'),
        workout('2026-11-18'),
        workout('2026-11-09'),
        workout('2026-11-02', true),
      ]),
    ).toBe(2);
  });

  it('counts weeks from the account’s own week start', () => {
    // Sunday 15 and Monday 16 November: two weeks from Monday, one week from Sunday.
    const weekend = [workout('2026-11-15'), workout('2026-11-16')];
    expect(trainedWeeks(weekend)).toBe(2);
    expect(trainedWeeks(weekend, 0)).toBe(1);
    // Four Sunday-and-Monday pairs are four weeks for a Sunday start, not eight.
    const pairs = [0, 7, 14, 21].flatMap((back) => [
      workout(addDays('2026-11-15', -back)),
      workout(addDays('2026-11-16', -back)),
    ]);
    expect(suggest({ workouts: pairs, weekStartDay: 0 })).toEqual({
      reason: 'no-block',
      weeks: 4,
    });
  });

  it('finds the day the weight goal changed direction', () => {
    expect(goalDirectionChangedOn([goal('2026-08-01', 90, 82), goal('2026-11-10', 82, 86)])).toBe(
      '2026-11-10',
    );
    expect(
      goalDirectionChangedOn([goal('2026-08-01', 90, 82), goal('2026-11-10', 82, 82, [81, 83])]),
    ).toBe('2026-11-10');
    // Another goal in the same direction, or a single goal, is not a change.
    expect(goalDirectionChangedOn([goal('2026-08-01', 90, 85), goal('2026-11-10', 85, 82)])).toBe(
      null,
    );
    expect(goalDirectionChangedOn([goal('2026-08-01', 90, 85)])).toBeNull();
  });

  it('words each reason in a few words', () => {
    expect(blockSuggestionLabel({ reason: 'returning', days: 13 })).toBe('Back after 13 days off');
    expect(blockSuggestionLabel({ reason: 'new-goal' })).toBe('New weight goal');
    expect(blockSuggestionLabel({ reason: 'stalled', weeks: 3 })).toBe(
      'No new records for 3 weeks',
    );
    expect(blockSuggestionLabel({ reason: 'no-block', weeks: 6 })).toBe(
      '6 weeks trained, no block yet',
    );
  });
});
