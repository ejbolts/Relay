import { describe, expect, it } from 'vitest';
import { rangeOutgrowsBlock, withNormalisedRelativeStrength } from './exerciseProgressScope';
import type { ExerciseProgress, MachineProgressPoint, WeightMapping } from './types';

describe('rangeOutgrowsBlock', () => {
  const block = { start_date: '2026-10-19', end_date: null };

  it('shows all time for ranges longer than the running block', () => {
    // The block has run for 32 days on 19 Nov.
    expect(rangeOutgrowsBlock('1m', block, '2026-11-19')).toBe(false);
    expect(rangeOutgrowsBlock('3m', block, '2026-11-19')).toBe(true);
    expect(rangeOutgrowsBlock('all', block, '2026-11-19')).toBe(true);
  });

  it('measures a finished block to its end', () => {
    const finished = { start_date: '2026-01-05', end_date: '2026-05-04' };
    expect(rangeOutgrowsBlock('3m', finished, '2026-11-19')).toBe(false);
    expect(rangeOutgrowsBlock('9m', finished, '2026-11-19')).toBe(true);
  });
});

describe('withNormalisedRelativeStrength', () => {
  const point = (
    workoutId: string,
    machine: string | null,
    ratio: number,
    bodyweight = 82.5,
  ): MachineProgressPoint => ({
    workout_id: workoutId,
    workout_date: `2026-11-${workoutId}`,
    machine_photo_id: machine,
    relative_strength: ratio,
    bodyweight_kg: bodyweight,
    best_weight_kg: ratio * bodyweight,
    best_reps: 10,
    estimated_1rm: 0,
    volume_kg: 0,
    best_rpe: null,
  });
  // 150 kg on the Cybex feels like 120 kg on the Hammer, the reference.
  const mapping: WeightMapping = {
    enabled: true,
    reference_machine_id: 'hammer',
    machines: [
      {
        id: 'cybex',
        caption: 'Cybex',
        thumbnail_url: '',
        workout_count: 2,
        last_used_date: null,
        machine_kg: 150,
        reference_kg: 120,
      },
    ],
  };
  const progress = {
    points: [],
    machine_points: [point('10', 'cybex', 2.96), point('17', 'hammer', 2.42)],
  } as unknown as ExerciseProgress;

  it('converts each machine’s ratio to the reference machine’s weights', () => {
    const points = [point('10', null, 2.96), point('17', null, 2.42)];
    const normalised = withNormalisedRelativeStrength(points, progress, mapping);

    expect(normalised.map((item) => item.relative_strength)).toEqual([2.368, 2.42]);
  });

  it('leaves points alone without machine sessions', () => {
    const points = [point('10', null, 2.96)];
    expect(
      withNormalisedRelativeStrength(points, { ...progress, machine_points: [] }, mapping),
    ).toBe(points);
  });
});
