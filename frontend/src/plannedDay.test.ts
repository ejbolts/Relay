import { describe, expect, it } from 'vitest';
import { categoryForType, nextTrainingDay, plannedDayOn, routineDayFor } from './plannedDay';
import type { Routine, TrainingSplit, WorkoutType } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

const custom: WorkoutType = {
  id: 'custom-a',
  name: 'Full body A',
  color: '#123456',
  is_custom: true,
  archived: false,
};
const types = [...DEFAULT_WORKOUT_TYPES, custom];

// Upper, Lower, rest, following logged workouts; next up is Upper today.
const split: TrainingSplit = {
  name: 'Upper / Lower',
  enabled: true,
  start_date: '2026-11-01',
  progression: 'workouts',
  steps: [{ workout_type_id: 'upper' }, { workout_type_id: 'lower' }, { workout_type_id: null }],
  next_step: 0,
  next_date: '2026-11-19',
};

describe('planned split days', () => {
  it('plans today and later days as if each earlier one is done as planned', () => {
    const today = plannedDayOn(split, '2026-11-19', '2026-11-19', types);
    expect(today).toMatchObject({ kind: 'training', step: 0, type: { id: 'upper' } });
    expect(plannedDayOn(split, '2026-11-20', '2026-11-19', types)).toMatchObject({
      kind: 'training',
      step: 1,
      type: { id: 'lower' },
    });
    expect(plannedDayOn(split, '2026-11-21', '2026-11-19', types)).toEqual({
      kind: 'rest',
      date: '2026-11-21',
    });
    expect(plannedDayOn(split, '2026-11-22', '2026-11-19', types)).toMatchObject({
      kind: 'training',
      step: 0,
    });
  });

  it('plans nothing for past days, a switched-off split or no split', () => {
    expect(plannedDayOn(split, '2026-11-18', '2026-11-19', types).kind).toBe('none');
    expect(plannedDayOn({ ...split, enabled: false }, '2026-11-20', '2026-11-19', types).kind).toBe(
      'none',
    );
    expect(plannedDayOn(null, '2026-11-20', '2026-11-19', types).kind).toBe('none');
  });

  it('plans nothing before a workout-following split reaches its next day', () => {
    const later = { ...split, next_date: '2026-11-21' };
    expect(plannedDayOn(later, '2026-11-20', '2026-11-19', types).kind).toBe('none');
    expect(plannedDayOn(later, '2026-11-21', '2026-11-19', types)).toMatchObject({
      kind: 'training',
      step: 0,
    });
  });

  it('asks for a split update when a planned type was removed or archived', () => {
    const removed = { ...split, steps: [{ workout_type_id: 'gone' }, ...split.steps.slice(1)] };
    expect(plannedDayOn(removed, '2026-11-19', '2026-11-19', types).kind).toBe('update');
    const archived = types.map((type) =>
      type.id === 'upper' ? { ...type, archived: true } : type,
    );
    expect(plannedDayOn(split, '2026-11-19', '2026-11-19', archived).kind).toBe('update');
  });

  it('finds the next training day after a rest day', () => {
    const resting = { ...split, next_step: 2 };
    expect(plannedDayOn(resting, '2026-11-19', '2026-11-19', types).kind).toBe('rest');
    expect(nextTrainingDay(resting, '2026-11-19', types)).toMatchObject({
      date: '2026-11-20',
      step: 0,
      type: { id: 'upper' },
    });
    expect(nextTrainingDay({ ...split, enabled: false }, '2026-11-19', types)).toBeNull();
  });

  it('follows calendar-pinned splits by date', () => {
    const pinned: TrainingSplit = { ...split, progression: 'calendar', start_date: '2026-11-18' };
    expect(plannedDayOn(pinned, '2026-11-19', '2026-11-19', types)).toMatchObject({
      kind: 'training',
      step: 1,
      type: { id: 'lower' },
    });
  });

  it('uses the routine day only while it still plans the same type', () => {
    const routine = {
      id: 'routine',
      name: 'Upper / Lower',
      shared: false,
      days: [
        { workout_type_id: 'upper', workout_type: null, movements: [] },
        { workout_type_id: 'push', workout_type: null, movements: [] },
      ],
    } satisfies Routine;
    const upper = types.find((type) => type.id === 'upper')!;
    const lower = types.find((type) => type.id === 'lower')!;
    expect(routineDayFor(routine, 0, upper)).toEqual({ ...routine.days[0], workout_type: upper });
    expect(routineDayFor(routine, 1, lower)).toBeNull();
    expect(routineDayFor(routine, 5, upper)).toBeNull();
    expect(routineDayFor(null, 0, upper)).toBeNull();
  });

  it('logs custom types as Other, like the server', () => {
    expect(categoryForType(custom)).toBe('other');
    expect(categoryForType(types.find((type) => type.id === 'lower')!)).toBe('lower');
  });
});
