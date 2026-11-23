import { describe, expect, it } from 'vitest';
import {
  canEditExerciseMuscles,
  exerciseEditChanges,
  exerciseEditCredits,
  exerciseHiddenNotice,
} from './exerciseEdit';
import type { Exercise } from './types';

const press: Exercise = {
  id: 'press',
  name: 'Landmine press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Front delts',
  equipment: 'Barbell',
  is_custom: true,
  is_favorite: false,
  muscle_contributions: [],
  default_muscle_set_credits: [
    { muscle_name: 'Triceps', sets: 0.5 },
    { muscle_name: 'Front delts', sets: 1 },
  ],
};

describe('exerciseEditChanges', () => {
  it('sends only what changed, with typed text tidied', () => {
    expect(exerciseEditChanges(press, { name: ' Landmine  press ', equipment: 'Barbell' })).toEqual(
      {},
    );
    expect(exerciseEditChanges(press, { name: 'Landmine Press', equipment: ' ' })).toEqual({
      name: 'Landmine Press',
      equipment: null,
    });
    expect(exerciseEditChanges(press, { name: '  ', equipment: 'Barbell' })).toBeNull();
  });

  it('starts from the saved muscles, full credits first, and compares them as a set', () => {
    const credits = exerciseEditCredits(press);
    expect(credits).toEqual([
      { muscle_name: 'Front delts', sets: 1 },
      { muscle_name: 'Triceps', sets: 0.5 },
    ]);
    const unchanged = { name: press.name, equipment: 'Barbell' };
    expect(
      exerciseEditChanges(press, { ...unchanged, muscle_set_credits: [...credits].reverse() }),
    ).toEqual({});
    expect(
      exerciseEditChanges(press, {
        ...unchanged,
        muscle_set_credits: [{ muscle_name: 'Front delts', sets: 1 }],
      }),
    ).toEqual({ muscle_set_credits: [{ muscle_name: 'Front delts', sets: 1 }] });
  });

  it('refuses a missing or repeated muscle, and never changes a standard exercise’s', () => {
    const draft = { name: press.name, equipment: 'Barbell' };
    expect(() =>
      exerciseEditChanges(press, { ...draft, muscle_set_credits: [{ muscle_name: '', sets: 1 }] }),
    ).toThrow('Choose a muscle for each target.');
    expect(() =>
      exerciseEditChanges(press, {
        ...draft,
        muscle_set_credits: [
          { muscle_name: 'Triceps', sets: 1 },
          { muscle_name: 'triceps', sets: 0.5 },
        ],
      }),
    ).toThrow('Choose each target muscle only once.');
    const standard = { ...press, is_custom: false };
    expect(canEditExerciseMuscles(standard)).toBe(false);
    expect(
      exerciseEditChanges(standard, {
        ...draft,
        muscle_set_credits: [{ muscle_name: '', sets: 1 }],
      }),
    ).toEqual({});
  });

  it('confirms hiding and showing', () => {
    expect(exerciseHiddenNotice(true)).toBe('Hidden from exercise lists');
    expect(exerciseHiddenNotice(false)).toBe('Shown in exercise lists');
  });
});
