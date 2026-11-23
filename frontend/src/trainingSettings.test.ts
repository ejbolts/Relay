import { describe, expect, it } from 'vitest';
import {
  autoSaveChoiceLabel,
  autoSaveChoices,
  defaultRestChoices,
  validWeeklySetGoals,
} from './trainingSettings';
import type { TrainingPreferences } from './types';
import { DEFAULT_WORKOUT_TYPES, workoutTypeNameError } from './workoutTypes';

describe('training settings choices', () => {
  it('keeps an unusual saved rest or auto-save time among the choices, in order', () => {
    expect(defaultRestChoices(null)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 300]);
    expect(defaultRestChoices(45).slice(0, 3)).toEqual([30, 45, 60]);
    expect(autoSaveChoices(null)).toEqual([60, 90, 120, 150, 180, 240, 300, 360]);
    expect(autoSaveChoices(45)[0]).toBe(45);
    expect(autoSaveChoiceLabel(150)).toBe('2 h 30 min');
  });

  it('accepts whole weekly set goals from 1 to 1,000', () => {
    const preferences: TrainingPreferences = {
      preferred_weight_unit: 'kg',
      week_start: 'monday',
      zone2_goal_minutes: 150,
      weekly_muscle_set_goal: 10,
      weekly_muscle_set_goals: { Chest: 12 },
    };
    expect(validWeeklySetGoals(preferences)).toBe(true);
    expect(validWeeklySetGoals({ ...preferences, weekly_muscle_set_goal: 0 })).toBe(false);
    expect(validWeeklySetGoals({ ...preferences, weekly_muscle_set_goals: { Chest: 2.5 } })).toBe(
      false,
    );
  });
});

describe('workout type names', () => {
  const types = [
    ...DEFAULT_WORKOUT_TYPES,
    { id: 'arms', name: 'Arms', color: '#123456', is_custom: true, archived: true },
  ];

  it('needs 1 to 40 characters and a name no other type uses', () => {
    expect(workoutTypeNameError(' ', types)).toBe('Enter a workout type name of 1–40 characters.');
    expect(workoutTypeNameError('x'.repeat(41), types)).toMatch(/1–40/);
    expect(workoutTypeNameError('push', types)).toBe(
      'That workout type already exists. Choose a different name.',
    );
    expect(workoutTypeNameError('ARMS', types)).toMatch(/in Removed types/);
    expect(workoutTypeNameError('Legs', types)).toBeNull();
  });

  it('lets a renamed type keep its own name', () => {
    expect(workoutTypeNameError('arms', types, 'arms')).toBeNull();
  });
});
