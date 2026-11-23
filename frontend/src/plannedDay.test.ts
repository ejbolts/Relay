import { describe, expect, it } from 'vitest';
import {
  calendarCreatePrompt,
  calendarDayTarget,
  categoryForType,
  nextTrainingDay,
  plannedDayButtons,
  plannedDayKicker,
  plannedDayOn,
  plannedDayStart,
  plannedDayTitle,
  plannedStartPlan,
  routineDayFor,
} from './plannedDay';
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

describe('mixed planned days', () => {
  const mixedSplit: TrainingSplit = {
    ...split,
    steps: [
      { workout_type_id: 'upper', extra_workout_type_ids: ['cardio'] },
      { workout_type_id: 'lower', extra_workout_type_ids: ['custom-gone'] },
      { workout_type_id: null },
    ],
  };

  it('plans a mixed day with its main type first and asks to update a removed extra', () => {
    expect(plannedDayOn(mixedSplit, '2026-11-19', '2026-11-19', types)).toMatchObject({
      kind: 'training',
      type: { id: 'upper' },
      extraTypes: [{ id: 'cardio' }],
    });
    expect(plannedDayOn(mixedSplit, '2026-11-20', '2026-11-19', types).kind).toBe('update');
    expect(plannedDayTitle(plannedDayOn(mixedSplit, '2026-11-19', '2026-11-19', types))).toBe(
      'Upper body + Cardio day',
    );
  });
});

describe('the planned-day sheet', () => {
  const today = '2026-11-19';

  it('opens a logged day, plans today with a split and later days, and asks on past days', () => {
    expect(calendarDayTarget('2026-11-18', today, true, true)).toBe('logged');
    expect(calendarDayTarget('2026-11-20', today, false, false)).toBe('planned');
    expect(calendarDayTarget(today, today, false, true)).toBe('planned');
    expect(calendarDayTarget(today, today, false, false)).toBe('create');
    expect(calendarDayTarget('2026-11-18', today, false, true)).toBe('create');
  });

  it('titles and dates the day', () => {
    const plan = plannedDayOn(split, today, today, types);
    expect(plannedDayTitle(plan)).toBe('Upper body day');
    expect(plannedDayTitle({ kind: 'rest', date: today })).toBe('Rest day');
    expect(plannedDayTitle({ kind: 'update', date: today })).toBe('Update your split');
    expect(plannedDayTitle({ kind: 'none', date: today })).toBe('Nothing planned');
    expect(plannedDayKicker(today, today)).toBe('Today');
    expect(plannedDayKicker('2026-11-20', today)).toBe(
      new Date(2026, 10, 20, 12).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    );
  });

  it("starts today's rest day as the next training day, but not a later rest day", () => {
    const resting = { ...split, next_step: 2 };
    const rest = plannedDayOn(resting, today, today, types);
    expect(plannedStartPlan(rest, resting, today, types)).toMatchObject({
      type: { id: 'upper' },
    });
    const laterRest = plannedDayOn(split, '2026-11-21', today, types);
    expect(plannedStartPlan(laterRest, split, today, types)).toBeNull();
  });

  it('starts a later training day now and offers an empty workout only today', () => {
    const later = plannedDayOn(split, '2026-11-20', today, types);
    const startPlan = plannedStartPlan(later, split, today, types);
    expect(plannedDayButtons({ plan: later, startPlan, today, activeWorkout: false })).toEqual({
      resume: false,
      start: { label: 'Start now', accessibilityLabel: 'Start Lower body now' },
      empty: null,
    });
    const now = plannedDayOn(split, today, today, types);
    const todayPlan = plannedStartPlan(now, split, today, types);
    expect(
      plannedDayButtons({ plan: now, startPlan: todayPlan, today, activeWorkout: false }),
    ).toEqual({
      resume: false,
      start: { label: 'Start Upper body', accessibilityLabel: 'Start Upper body' },
      empty: { label: 'Empty', compact: true },
    });
    const nothing = { kind: 'none' as const, date: today };
    expect(
      plannedDayButtons({ plan: nothing, startPlan: null, today, activeWorkout: false }).empty,
    ).toEqual({ label: 'Start empty workout', compact: false });
    expect(
      plannedDayButtons({ plan: now, startPlan: todayPlan, today, activeWorkout: true }),
    ).toEqual({ resume: true, start: null, empty: null });
  });

  it("pre-fills the day from the split's routine", () => {
    const plan = plannedDayOn(split, today, today, types);
    const startPlan = plannedStartPlan(plan, split, today, types)!;
    const routine = {
      id: 'routine',
      name: 'Upper / Lower',
      shared: false,
      days: [
        {
          workout_type_id: 'upper',
          workout_type: null,
          movements: [
            {
              exercise: {
                id: 'bench',
                name: 'Bench Press',
                muscle_group: 'Chest',
                category: 'strength',
                kind: 'strength',
              },
              sets: 3,
              reps: 8,
              weight_kg: 60,
            },
          ],
        },
      ],
    } as unknown as Routine;
    const start = plannedDayStart({
      startPlan,
      routine,
      workouts: [],
      savedExercises: {},
      today,
      weightUnit: 'kg',
    });
    expect(start.category).toBe('upper');
    expect(start.type.id).toBe('upper');
    expect(start.template?.exercises.map((item) => item.exercise.name)).toEqual(['Bench Press']);
  });

  it('asks before replacing the live workout', () => {
    expect(calendarCreatePrompt('2026-11-18', false)).toMatchObject({
      title: 'Create a new workout?',
      confirm: 'Create workout',
      destructive: false,
    });
    expect(calendarCreatePrompt('2026-11-18', true)).toMatchObject({
      title: 'Cancel your current workout?',
      cancel: 'Keep current workout',
      confirm: 'Cancel & create new',
      destructive: true,
    });
  });
});
