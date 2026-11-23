import { describe, expect, it } from 'vitest';
import {
  exerciseMuscleChoices,
  exerciseNameFromSearch,
  newExerciseDraft,
  prepareExerciseInput,
  type ExerciseCreationDraft,
} from './exerciseCreation';
import type { Exercise } from './types';

const draft: ExerciseCreationDraft = {
  name: '  Cable Lat Pullover  ',
  category: 'pull',
  kind: 'strength',
  muscle_group: ' Lats ',
  equipment: ' Cable ',
  muscle_set_credits: [{ muscle_name: ' Lats ', sets: 1 }],
};

describe('new exercise validation', () => {
  it('normalizes the form into a typed creation payload', () => {
    expect(prepareExerciseInput(draft, [])).toEqual({
      name: 'Cable Lat Pullover',
      category: 'pull',
      kind: 'strength',
      muscle_group: 'Lats',
      equipment: 'Cable',
      muscle_set_credits: [{ muscle_name: 'Lats', sets: 1 }],
    });
  });

  it('accepts optional equipment and cardio exercises', () => {
    expect(
      prepareExerciseInput({ ...draft, category: 'cardio', kind: 'cardio', equipment: ' ' }, []),
    ).toMatchObject({ category: 'cardio', kind: 'cardio', equipment: null });
  });

  it('keeps partial muscle credit and omits strength credit for either cardio classification', () => {
    expect(
      prepareExerciseInput(
        { ...draft, muscle_set_credits: [{ muscle_name: 'Lats', sets: 0.5 }] },
        [],
      ),
    ).toMatchObject({
      muscle_group: 'Lats',
      muscle_set_credits: [{ muscle_name: 'Lats', sets: 0.5 }],
    });
    for (const patch of [{ category: 'cardio' as const }, { kind: 'cardio' as const }]) {
      expect(prepareExerciseInput({ ...draft, ...patch }, [])).not.toHaveProperty(
        'muscle_set_credits',
      );
    }
  });

  it.each([
    [{ name: ' ' }, 'Enter an exercise name.'],
    [{ category: '' }, 'Choose an exercise category.'],
    [{ muscle_set_credits: [] }, 'Choose a muscle'],
    [{ muscle_set_credits: [{ muscle_name: ' ', sets: 1 }] }, 'Choose a muscle'],
    [{ name: 'a'.repeat(161) }, '160 characters'],
    [{ muscle_set_credits: [{ muscle_name: 'a'.repeat(101), sets: 1 }] }, '100 characters'],
    [{ equipment: 'a'.repeat(101) }, '100 characters'],
  ] as Array<[Partial<ExerciseCreationDraft>, string]>)(
    'rejects invalid fields: %o',
    (patch, error) => {
      expect(() => prepareExerciseInput({ ...draft, ...patch }, [])).toThrow(error);
    },
  );

  it('rejects an existing name regardless of whitespace or case', () => {
    expect(() => prepareExerciseInput(draft, [{ name: ' cable LAT pullover ' }])).toThrow(
      'already exists',
    );
  });

  it('keeps independent credits for multiple muscles and uses the first target for the library label', () => {
    expect(
      prepareExerciseInput(
        {
          ...draft,
          muscle_set_credits: [
            { muscle_name: ' Pectorals ', sets: 1 },
            { muscle_name: ' Triceps ', sets: 0.5 },
          ],
        },
        [],
      ),
    ).toMatchObject({
      muscle_group: 'Pectorals',
      muscle_set_credits: [
        { muscle_name: 'Pectorals', sets: 1 },
        { muscle_name: 'Triceps', sets: 0.5 },
      ],
    });
    expect(() =>
      prepareExerciseInput(
        {
          ...draft,
          muscle_set_credits: [
            { muscle_name: 'Lats', sets: 1 },
            { muscle_name: ' lats ', sets: 0.5 },
          ],
        },
        [],
      ),
    ).toThrow('only once');
  });
});

describe('starting a new exercise', () => {
  it('starts named after the search, in the given category, as strength unless cardio', () => {
    expect(newExerciseDraft('Sissy Squat', 'lower')).toMatchObject({
      name: 'Sissy Squat',
      category: 'lower',
      kind: 'strength',
      muscle_set_credits: [{ muscle_name: '', sets: 1 }],
    });
    expect(newExerciseDraft('x'.repeat(200), 'cardio')).toMatchObject({ kind: 'cardio' });
    expect(newExerciseDraft('x'.repeat(200), 'cardio').name).toHaveLength(160);
  });

  it('capitalises a search into a name', () => {
    expect(exerciseNameFromSearch('sissy squat')).toBe('Sissy Squat');
    expect(exerciseNameFromSearch('élan row')).toBe('Élan Row');
  });

  it('offers every muscle strength exercises credit, never cardio ones', () => {
    const exercise = (values: Partial<Exercise>) => values as Exercise;
    expect(
      exerciseMuscleChoices([
        exercise({ kind: 'strength', category: 'lower', muscle_group: 'Quadriceps' }),
        exercise({
          kind: 'strength',
          category: 'push',
          muscle_group: 'Chest',
          muscle_set_credits: [
            { muscle_name: 'Chest', sets: 1 },
            { muscle_name: 'Triceps', sets: 0.5 },
          ],
        }),
        exercise({ kind: 'cardio', category: 'cardio', muscle_group: 'Cardio' }),
      ]),
    ).toEqual(['Chest', 'Quadriceps', 'Triceps']);
  });
});
