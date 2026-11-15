import { describe, expect, it } from 'vitest';
import {
  REP_RANGE_PRESETS,
  isRepRange,
  progressionHint,
  progressionTarget,
  progressionWeightKg,
  repRangeFromKey,
  repRangeKey,
  repRangeLabel,
} from './repProgression';
import { restoreWorkoutDraftMovements } from './workoutMovements';
import { routineSessionTemplate } from './routines';
import type { Exercise, RoutineDay, WorkoutType } from './types';

const range = { min: 8, max: 12 };
const set = (reps: number | null, weight_kg: number | null, extra = {}) => ({
  reps,
  weight_kg,
  warmup: false,
  set_type: 'normal' as const,
  completed: true,
  ...extra,
});
const hint = (sets: ReturnType<typeof set>[], unit: 'kg' | 'lb' = 'kg') =>
  progressionHint(range, progressionTarget(range, sets, unit), unit);

describe('rep range labels and keys', () => {
  it('labels a range and a single rep count', () => {
    expect(repRangeLabel(range)).toBe('8–12');
    expect(repRangeLabel({ min: 5, max: 5 })).toBe('5');
  });

  it('round-trips keys and rejects anything that is not a range', () => {
    for (const preset of REP_RANGE_PRESETS)
      expect(repRangeFromKey(repRangeKey(preset))).toEqual(preset);
    expect(repRangeKey(null)).toBe('');
    expect(repRangeFromKey('')).toBeNull();
    expect(repRangeFromKey('12-8')).toBeNull();
    for (const value of [null, {}, { min: 0, max: 5 }, { min: 5, max: 101 }, { min: 2.5, max: 5 }])
      expect(isRepRange(value)).toBe(false);
    expect(isRepRange(range)).toBe(true);
  });
});

describe('double progression from the last session', () => {
  it('only names the target when there is nothing to go on', () => {
    expect(progressionTarget(range, [], 'kg')).toEqual({ kind: 'start' });
    expect(hint([])).toBe('Target 8–12 reps');
    // Unfinished and warm-up sets are not evidence either.
    expect(
      hint([set(12, 80, { completed: false }), set(12, 40, { warmup: true, set_type: 'warmup' })]),
    ).toBe('Target 8–12 reps');
  });

  it('holds the weight until every top set reaches the highest reps', () => {
    expect(hint([set(12, 80), set(10, 80), set(9, 80)])).toBe('Target 8–12 reps · stay at 80 kg');
    expect(progressionTarget(range, [set(12, 80), set(11, 80)], 'kg')).toEqual({
      kind: 'hold',
      weightKg: 80,
    });
  });

  it('adds the smallest usual jump once every top set reaches the highest reps', () => {
    expect(hint([set(12, 80), set(12, 80), set(13, 80)])).toBe('Target 8–12 reps · try 82.5 kg');
    expect(progressionTarget(range, [set(12, 80)], 'kg')).toEqual({
      kind: 'increase',
      weightKg: 80,
      nextWeightKg: 82.5,
    });
  });

  it('judges the heaviest sets, not lighter back-off or warm-up sets', () => {
    // The top set fell short even though the back-off sets hit 12.
    expect(hint([set(9, 90), set(12, 80), set(12, 80)])).toBe('Target 8–12 reps · stay at 90 kg');
    expect(
      hint([set(12, 100, { warmup: true, set_type: 'warmup' }), set(12, 80), set(12, 80)]),
    ).toBe('Target 8–12 reps · try 82.5 kg');
  });

  it('names the weight to pre-fill, when the target has one', () => {
    expect(progressionWeightKg(progressionTarget(range, [], 'kg'))).toBeNull();
    expect(progressionWeightKg(progressionTarget(range, [set(10, 80)], 'kg'))).toBe(80);
    expect(progressionWeightKg(progressionTarget(range, [set(12, 80)], 'kg'))).toBe(82.5);
    expect(progressionWeightKg(progressionTarget(range, [set(12, null)], 'kg'))).toBeNull();
    expect(progressionWeightKg(progressionTarget(range, [set(9, null)], 'kg'))).toBeNull();
  });

  it('steps by five pounds for people who train in pounds', () => {
    const hundredPounds = 100 / 2.2046226218;
    expect(hint([set(12, hundredPounds)], 'lb')).toBe('Target 8–12 reps · try 105 lb');
  });

  it('suggests adding load for bodyweight work at the top of the range', () => {
    expect(hint([set(12, null), set(12, 0)])).toBe(
      'Target 8–12 reps · top of range reached, add load',
    );
    expect(hint([set(10, null)])).toBe('Target 8–12 reps');
  });
});

const bench: Exercise = {
  id: 'bench',
  name: 'Bench press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const bike: Exercise = { ...bench, id: 'bike', name: 'Bike', kind: 'cardio', category: 'cardio' };
const push: WorkoutType = {
  id: 'push',
  name: 'Push',
  color: '#ef476f',
  is_custom: false,
  archived: false,
};
const plannedSet = {
  reps: null,
  weight_kg: null,
  duration_seconds: null,
  distance_km: null,
  rest_seconds: 120,
  set_type: 'normal' as const,
};

describe('carrying a planned rep range into a workout', () => {
  it('passes the range from a split day to the workout template, strength only', () => {
    const day: RoutineDay = {
      workout_type_id: 'push',
      workout_type: push,
      movements: [
        { exercise_id: 'bench', exercise: bench, sets: [plannedSet], rep_range: range },
        { exercise_id: 'bike', exercise: bike, sets: [plannedSet], rep_range: range },
        { exercise_id: 'bench', exercise: bench, sets: [plannedSet], rep_range: null },
      ],
    };
    const template = routineSessionTemplate(day, 'Push', '2026-11-14', 'kg');
    expect(template.exercises.map((item) => item.repRange)).toEqual([range, undefined, undefined]);
  });

  it('restores a stored range with the draft and drops one that is not valid', () => {
    const stored = (repRange: unknown) => ({
      key: 'movement',
      exerciseId: 'bench',
      notes: '',
      machinePhotoIds: [],
      supersetKey: null,
      sets: [],
      repRange: repRange as never,
    });
    expect(restoreWorkoutDraftMovements([stored(range)], [bench])![0].repRange).toEqual(range);
    expect(
      'repRange' in restoreWorkoutDraftMovements([stored({ min: 12, max: 8 })], [bench])![0],
    ).toBe(false);
  });
});
