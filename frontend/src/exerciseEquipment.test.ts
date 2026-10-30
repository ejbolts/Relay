import { expect, it } from 'vitest';
import { exerciseEquipment, exerciseEquipmentOptions } from './exerciseEquipment';

it('groups equipment spellings without changing custom labels or the saved field', () => {
  expect(
    exerciseEquipmentOptions([
      { equipment: 'Dumbbells' },
      { equipment: ' dumbbell ' },
      { equipment: 'Cable' },
      { equipment: 'Suspension trainer' },
      { equipment: null },
    ]),
  ).toEqual(['Cable', 'Dumbbell', 'Suspension trainer', 'Unspecified']);
  expect(exerciseEquipment('Smith-machine')).toBe('Smith machine');
  expect(exerciseEquipment('EZ curl bar')).toBe('EZ bar');
});
