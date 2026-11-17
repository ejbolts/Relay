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
    ['Single-Arm Lat Pulldown (Machine)', 'single-arm-machine-lat-pulldown'],
    ['Single-Arm Cable Lat Pulldown', 'single-arm-cable-lat-pulldown'],
    ['Single-Arm Cable Biceps Curl', 'single-arm-cable-biceps-curl'],
    ['Single-Arm Cable Triceps Pushdown', 'single-arm-cable-triceps-pushdown'],
    ['Dumbbell Row', 'dumbbell-row'],
    ['Dumbbell Shoulder Press', 'dumbbell-shoulder-press'],
    ['Dumbbell Bench Press', 'dumbbell-bench-press'],
    ['Incline Dumbbell Press', 'incline-dumbbell-press'],
    ['Dumbbell Reverse Fly', 'dumbbell-reverse-fly'],
    ['Push-up', 'push-up'],
  ])('gives %s the third-batch movement and equipment illustration', (name, key) => {
    const movement = exercise(name);
    expect(exerciseIconKey(movement)).toBe(key);
    expect(exerciseIconFor(movement)).toContain(`${key}.webp`);
  });

  it.each([
    ['Single arm lat pulldown', 'Machine', 'single-arm-machine-lat-pulldown'],
    ['Single Arm Machine Lat Pull Down', 'Machine', 'single-arm-machine-lat-pulldown'],
    ['One-arm lat pull-down', 'Plate-loaded machine', 'single-arm-machine-lat-pulldown'],
    ['Unilateral lat pulldown', 'Cable machine', 'single-arm-cable-lat-pulldown'],
    ['Single arm lat pull down', 'Cable', 'single-arm-cable-lat-pulldown'],
    ['Single-arm biceps curl', 'Cable', 'single-arm-cable-biceps-curl'],
    ['One arm triceps push-down', 'Cable', 'single-arm-cable-triceps-pushdown'],
    ['Single-arm Row', 'Dumbbell', 'dumbbell-row'],
    ['Shoulder Press', 'Dumbbell', 'dumbbell-shoulder-press'],
    ['Flat Bench Press', 'Dumbbell', 'dumbbell-bench-press'],
    ['Incline Bench Press', 'Dumbbell', 'incline-dumbbell-press'],
    ['Rear Delt Fly', 'Dumbbell', 'dumbbell-reverse-fly'],
    ['Push ups', 'Bodyweight', 'push-up'],
  ])('uses the correct third-batch icon for %s on %s', (name, equipment, key) => {
    expect(exerciseIconKey(exercise(name, { equipment }))).toBe(key);
  });

  it.each([
    ['Cable Biceps Curl', 'Cable', 'biceps-curl'],
    ['Single-Arm Preacher Curl', 'Dumbbell', 'preacher-curl'],
    ['Single-Arm Cable Hammer Curl', 'Cable', 'biceps-curl'],
    ['Single-Arm Cable Leg Curl', 'Cable', 'hamstring-curl'],
    ['Chest-Supported Dumbbell Row', 'Dumbbell', 'seated-row'],
    ['Overhead Press', 'Barbell', 'overhead-press'],
    ['Incline Barbell Bench Press', 'Barbell', 'bench-press'],
  ])('keeps the different equipment or movement for %s', (name, equipment, key) => {
    expect(exerciseIconKey(exercise(name, { equipment }))).toBe(key);
  });

  it.each([
    ['Smith Machine Bench Press', 'smith-bench-press'],
    ['Smith Machine Shoulder Press', 'smith-shoulder-press'],
    ['Smith Machine Squat', 'smith-squat'],
    ['Machine Lat Pulldown', 'machine-lat-pulldown'],
    ['Cable Glute Kickback', 'cable-glute-kickback'],
    ['Cable Crunch', 'cable-crunch'],
    ['Straight-Arm Cable Pulldown', 'straight-arm-cable-pulldown'],
    ['Overhead Cable Triceps Extension', 'overhead-cable-triceps-extension'],
    ['Cable Lateral Raise', 'cable-lateral-raise'],
    ['Barbell Row', 'barbell-row'],
  ])('corrects the movement and equipment illustration for %s', (name, key) => {
    const movement = exercise(name);
    expect(exerciseIconKey(movement)).toBe(key);
    expect(exerciseIconFor(movement)).toContain(`${key}.webp`);
  });

  it.each([
    ['Bench Press', 'Smith machine', 'smith-bench-press'],
    ['Chest Press', 'Smith machine', 'smith-bench-press'],
    ['Shoulder Press', 'Smith machine', 'smith-shoulder-press'],
    ['Overhead Press', 'Smith machine', 'smith-shoulder-press'],
    ['Back Squat', 'Smith machine', 'smith-squat'],
    ['Lat Pulldown', 'Machine', 'machine-lat-pulldown'],
    ['Wide Lat Pull-down', 'Plate-loaded machine', 'machine-lat-pulldown'],
    ['Glute Kickback', 'Cable', 'cable-glute-kickback'],
    ['Kneeling Crunch', 'Cable', 'cable-crunch'],
    ['Straight Arm Pull-down', 'Cable machine', 'straight-arm-cable-pulldown'],
    ['Overhead Triceps Extension', 'Cable machine', 'overhead-cable-triceps-extension'],
    ['Lateral Raise', 'Cable', 'cable-lateral-raise'],
    ['Bent-over Row', 'Barbell', 'barbell-row'],
  ])('uses %s with %s equipment to select the second-batch icon', (name, equipment, key) => {
    expect(exerciseIconKey(exercise(name, { equipment }))).toBe(key);
  });

  it.each([
    ['Back Squat', 'Barbell', 'back-squat'],
    ['Lat Pulldown', 'Cable', 'lat-pulldown'],
    ['Crunch', 'Bodyweight', 'core'],
    ['Seated Ab Crunch Machine', 'Machine', 'ab-crunch-machine'],
    ['Overhead Dumbbell Triceps Extension', 'Dumbbell', 'triceps-pushdown'],
    ['Triceps Cable Kickback', 'Cable', 'triceps-pushdown'],
    ['Single-Arm Cable Pullover', 'Cable', 'lat-pulldown'],
    ['Band Row', 'Resistance band', 'seated-row'],
    ['Barbell Upright Row', 'Barbell', 'seated-row'],
  ])('does not apply a second-batch icon to the different movement %s', (name, equipment, key) => {
    expect(exerciseIconKey(exercise(name, { equipment }))).toBe(key);
  });

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
    ['Seated Cable Row', 'Cable', 'seated-row'],
    ['Single-Arm Cable Row', 'Cable machine', 'seated-row'],
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
