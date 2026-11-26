import { describe, expect, it } from 'vitest';
import {
  contributionDetail,
  goalMuscles,
  muscleGoalSavedMessage,
  stepMuscleSetGoal,
  validMuscleSetGoal,
  withMuscleSetGoal,
} from './muscleGoalEditing';
import type { Exercise, WeeklyMuscleContribution } from './types';

describe('muscle goal editing', () => {
  it('accepts whole numbers of sets from 1 to 1,000', () => {
    expect(validMuscleSetGoal(1)).toBe(true);
    expect(validMuscleSetGoal(1000)).toBe(true);
    expect(validMuscleSetGoal(0)).toBe(false);
    expect(validMuscleSetGoal(1001)).toBe(false);
    expect(validMuscleSetGoal(2.5)).toBe(false);
    expect(validMuscleSetGoal(Number.NaN)).toBe(false);
  });

  it('steps within the range, from the goal while the field is blank', () => {
    expect(stepMuscleSetGoal('12', 10, 1)).toBe('13');
    expect(stepMuscleSetGoal('', 10, -1)).toBe('9');
    expect(stepMuscleSetGoal('1', 10, -1)).toBe('1');
    expect(stepMuscleSetGoal('1000', 10, 1)).toBe('1000');
  });

  it("changes one muscle's goal without touching the others", () => {
    const goals = { Chest: 12, Lats: 14 };
    expect(withMuscleSetGoal(goals, 'Chest', 16)).toEqual({ Chest: 16, Lats: 14 });
    expect(withMuscleSetGoal(goals, 'Chest', null)).toEqual({ Lats: 14 });
    expect(goals).toEqual({ Chest: 12, Lats: 14 });
    expect(withMuscleSetGoal(undefined, 'Quads', 8)).toEqual({ Quads: 8 });
  });

  it('confirms the change', () => {
    expect(muscleGoalSavedMessage('Chest', 12)).toBe('Chest goal set to 12 sets');
    expect(muscleGoalSavedMessage('Chest', null)).toBe('Chest uses the default goal');
  });

  it('lists every credited muscle and any with a goal, alphabetically', () => {
    const bench = {
      id: 'bench',
      name: 'Bench Press',
      muscle_group: 'Chest',
      secondary_muscles: ['Triceps'],
      category: 'strength',
      kind: 'strength',
    } as unknown as Exercise;
    expect(goalMuscles([bench], { Calves: 6 })).toEqual(
      expect.arrayContaining(['Calves', 'Chest']),
    );
    const listed = goalMuscles([bench], { Calves: 6 });
    expect([...listed].sort((a, b) => a.localeCompare(b))).toEqual(listed);
  });

  it('describes how a workout counted towards a muscle', () => {
    const contribution = (working_sets: number, credit_per_set: number) =>
      ({ working_sets, credit_per_set }) as WeeklyMuscleContribution;
    expect(contributionDetail(contribution(3, 1))).toBe('3 working sets × 1 · Direct');
    expect(contributionDetail(contribution(1, 0.5))).toBe('1 working set × 0.5 · Assistance');
  });
});
