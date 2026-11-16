import { describe, expect, it } from 'vitest';
import { exerciseIconFor, exerciseIconKey } from './exerciseIcons';
import type { Exercise } from './types';

function exercise(
  name: string,
  overrides: Partial<Pick<Exercise, 'kind' | 'category' | 'muscle_group' | 'equipment'>> = {},
) {
  return {
    name,
    kind: 'strength' as const,
    category: 'other' as const,
    muscle_group: '',
    equipment: null,
    ...overrides,
  };
}

describe('exerciseIconKey', () => {
  it.each([
    ['Machine Chest Press', 'machine-chest-press'],
    ['Machine Shoulder Press', 'machine-shoulder-press'],
    ['Machine Lateral Raise', 'machine-lateral-raise'],
    ['Seated Machine Row', 'machine-row'],
    ['Seated Leg Curl', 'seated-leg-curl'],
    ['Machine Hip Thrust', 'machine-hip-thrust'],
    ['Hip Abduction Machine', 'hip-abduction-machine'],
    ['Seated Calf Raise', 'seated-calf-raise'],
    ['Reverse Pec Deck', 'reverse-pec-deck'],
    ['Triceps Machine Extension', 'triceps-extension-machine'],
  ])('gives %s its own matching illustration', (name, key) => {
    const movement = exercise(name);
    expect(exerciseIconKey(movement)).toBe(key);
    expect(exerciseIconFor(movement)).toContain(`${key}.webp`);
  });

  it.each([
    ['Chest Press', 'machine-chest-press'],
    ['Narrow Chest Press', 'machine-chest-press'],
    ['Bench Press', 'machine-chest-press'],
    ['Shoulder Press', 'machine-shoulder-press'],
    ['Overhead Press', 'machine-shoulder-press'],
    ['Lateral Raise', 'machine-lateral-raise'],
    ['Chest-Supported Row', 'machine-row'],
    ['Seated Hamstring Curl', 'seated-leg-curl'],
    ['Hip Thrust', 'machine-hip-thrust'],
    ['Hip Abduction', 'hip-abduction-machine'],
    ['Seated Calf Raise', 'seated-calf-raise'],
    ['Rear Delt Fly', 'reverse-pec-deck'],
    ['Triceps Extension', 'triceps-extension-machine'],
  ])('uses the machine equipment field for %s', (name, key) => {
    expect(exerciseIconKey(exercise(name, { equipment: 'Machine' }))).toBe(key);
  });

  it.each([
    ['Lying Leg Curl', 'Machine', 'hamstring-curl'],
    ['Standing Calf Raise', 'Machine', 'calf-raise'],
    ['Pec Deck', 'Machine', 'pec-deck'],
    ['Barbell Bench Press', 'Barbell', 'bench-press'],
    ['Hip Thrust', 'Barbell', 'hip-thrust'],
    ['Dumbbell Shoulder Press', 'Dumbbell', 'overhead-press'],
    ['Smith Machine Shoulder Press', 'Smith machine', 'overhead-press'],
    ['Shoulder Press', 'Smith machine', 'overhead-press'],
    ['Cable Lateral Raise', 'Cable', 'lateral-raise'],
    ['Seated Cable Row', 'Cable', 'seated-row'],
    ['Single-Arm Cable Row', 'Cable machine', 'seated-row'],
    ['Dumbbell Row', 'Dumbbell', 'seated-row'],
    ['Dumbbell Reverse Fly', 'Dumbbell', 'face-pull'],
    ['Triceps Pushdown', 'Cable', 'triceps-pushdown'],
  ])('keeps the distinct existing illustration for %s', (name, equipment, key) => {
    expect(exerciseIconKey(exercise(name, { equipment }))).toBe(key);
  });

  it('matches normalized names and machine variants without treating cardio as a strength row', () => {
    expect(exerciseIconKey(exercise('  MACHINE   CHEST PRESS  '))).toBe('machine-chest-press');
    expect(exerciseIconKey(exercise('Plate-loaded Shoulder Press'))).toBe('machine-shoulder-press');
    expect(exerciseIconKey(exercise('Unilateral Row', { equipment: 'Selectorized' }))).toBe(
      'machine-row',
    );
    expect(exerciseIconKey(exercise('Reverse Pec Deck - single arm'))).toBe('reverse-pec-deck');
    expect(
      exerciseIconKey(exercise('Indoor rowing machine', { kind: 'cardio', equipment: 'Machine' })),
    ).toBe('rowing');
  });

  it('maps the new machine and lower-body illustrations', () => {
    expect(exerciseIconKey(exercise('Pec Deck'))).toBe('pec-deck');
    expect(exerciseIconKey(exercise('Hack Squat'))).toBe('hack-squat');
    expect(exerciseIconKey(exercise('Romanian Deadlift'))).toBe('romanian-deadlift');
    expect(exerciseIconKey(exercise('Seated Ab Crunch Machine'))).toBe('ab-crunch-machine');
  });

  it('uses the dedicated quad-and-calf incline walking image', () => {
    expect(
      exerciseIconKey(
        exercise('Incline Treadmill Walking', {
          kind: 'cardio',
          category: 'cardio',
          equipment: 'Treadmill',
        }),
      ),
    ).toBe('incline-walk');
  });

  it('maps cardio activities and custom exercise names to a useful fallback', () => {
    expect(exerciseIconKey(exercise('Cycling (Indoor)', { kind: 'cardio' }))).toBe('cycling');
    expect(exerciseIconKey(exercise('Outdoor rowing', { kind: 'cardio' }))).toBe('rowing');
    expect(
      exerciseIconKey(
        exercise('My custom quad movement', { category: 'lower', muscle_group: 'Quadriceps' }),
      ),
    ).toBe('back-squat');
    expect(exerciseIconKey(exercise('Custom cable extension', { muscle_group: 'Triceps' }))).toBe(
      'triceps-pushdown',
    );
  });
});
