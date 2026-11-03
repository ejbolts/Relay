import { describe, expect, it } from 'vitest';
import {
  defaultReferenceId,
  isNormalised,
  machineFactor,
  machinesWithSessions,
  progressViewPoints,
  runningBestIds,
  suggestFactors,
  withReference,
} from './machineWeights';
import type { ExerciseProgress, MachineProgressPoint, MachineWeight, WeightMapping } from './types';

function machine(id: string, overrides: Partial<MachineWeight> = {}): MachineWeight {
  return {
    id,
    caption: id,
    thumbnail_url: `/${id}.webp`,
    workout_count: 1,
    last_used_date: null,
    machine_kg: null,
    reference_kg: null,
    ...overrides,
  };
}

function point(
  workoutId: string,
  date: string,
  machineId: string | null,
  weight: number,
  volume = weight * 10,
): MachineProgressPoint {
  return {
    workout_id: workoutId,
    workout_date: date,
    best_weight_kg: weight,
    best_reps: 8,
    estimated_1rm: weight * 1.25,
    volume_kg: volume,
    best_rpe: null,
    machine_photo_id: machineId,
  };
}

const hammerToLife: WeightMapping = {
  enabled: true,
  reference_machine_id: 'hammer',
  machines: [
    machine('hammer', { workout_count: 5 }),
    machine('life', { workout_count: 3, machine_kg: 40, reference_kg: 50 }),
    machine('techno', { workout_count: 1 }),
  ],
};

function progress(machinePoints: MachineProgressPoint[]): ExerciseProgress {
  const byWorkout = new Map<string, MachineProgressPoint>();
  for (const item of machinePoints) {
    const current = byWorkout.get(item.workout_id);
    if (!current || item.best_weight_kg > current.best_weight_kg) {
      byWorkout.set(item.workout_id, item);
    }
  }
  return {
    exercise: {} as ExerciseProgress['exercise'],
    points: [...byWorkout.values()].map((item) => ({ ...item, machine_photo_id: undefined })),
    machine_points: machinePoints,
    personal_best_weight_kg: 0,
    personal_best_estimated_1rm: 0,
  };
}

describe('machine weight normalisation', () => {
  it('converts only mapped machines while normalising is on', () => {
    expect(machineFactor(hammerToLife, 'life')).toBe(1.25);
    expect(machineFactor(hammerToLife, 'hammer')).toBe(1);
    expect(machineFactor(hammerToLife, 'techno')).toBe(1);
    expect(machineFactor(hammerToLife, null)).toBe(1);
    expect(machineFactor({ ...hammerToLife, enabled: false }, 'life')).toBe(1);
    expect(isNormalised(hammerToLife, 'all')).toBe(true);
    expect(isNormalised(hammerToLife, 'life')).toBe(false);
  });

  it('shows All machines in reference weights and keeps the logged set', () => {
    const data = progress([
      point('w1', '2026-10-01', 'hammer', 80),
      point('w2', '2026-10-08', 'life', 66),
      point('w3', '2026-10-15', null, 82),
    ]);
    const all = progressViewPoints(data, hammerToLife, 'all');
    expect(all.map((item) => item.best_weight_kg)).toEqual([80, 82.5, 82]);
    expect(all.map((item) => item.raw_best_weight_kg)).toEqual([80, 66, 82]);
    expect(all[1].estimated_1rm).toBe(103.1);
    expect(all[1].volume_kg).toBe(825);

    const off = progressViewPoints(data, { ...hammerToLife, enabled: false }, 'all');
    expect(off.map((item) => item.best_weight_kg)).toEqual([80, 66, 82]);
  });

  it('combines a workout that used two machines', () => {
    const data = progress([
      point('w1', '2026-10-01', 'hammer', 70, 700),
      point('w1', '2026-10-01', 'life', 60, 600),
    ]);
    const [combined] = progressViewPoints(data, hammerToLife, 'all');
    expect(combined.best_weight_kg).toBe(75);
    expect(combined.raw_best_weight_kg).toBe(60);
    expect(combined.volume_kg).toBe(1450);
  });

  it('shows one machine as logged, with sessions without a machine on the reference', () => {
    const data = progress([
      point('w1', '2026-10-01', 'hammer', 80),
      point('w2', '2026-10-08', 'life', 66),
      point('w3', '2026-10-15', null, 82),
    ]);
    expect(progressViewPoints(data, hammerToLife, 'life').map((item) => item.workout_id)).toEqual([
      'w2',
    ]);
    expect(progressViewPoints(data, hammerToLife, 'hammer').map((item) => item.workout_id)).toEqual(
      ['w1', 'w3'],
    );
    expect(
      progressViewPoints(data, { ...hammerToLife, enabled: false }, 'hammer').map(
        (item) => item.workout_id,
      ),
    ).toEqual(['w1']);
    expect(machinesWithSessions(data, hammerToLife).map((item) => item.id)).toEqual([
      'hammer',
      'life',
    ]);
  });

  it('re-expresses pairs against a new reference without changing conversions', () => {
    const mapping: WeightMapping = {
      ...hammerToLife,
      machines: [
        machine('hammer'),
        machine('life', { machine_kg: 40, reference_kg: 50 }),
        machine('techno', { machine_kg: 50, reference_kg: 45 }),
      ],
    };
    const next = withReference(mapping, 'life');
    expect(next.reference_machine_id).toBe('life');
    const byId = Object.fromEntries(next.machines.map((item) => [item.id, item]));
    expect(byId.life.machine_kg).toBeNull();
    expect([byId.hammer.machine_kg, byId.hammer.reference_kg]).toEqual([50, 40]);
    expect([byId.techno.machine_kg, byId.techno.reference_kg]).toEqual([50, 36]);
    expect(machineFactor(next, 'techno') / machineFactor(next, 'hammer')).toBeCloseTo(0.9 / 1);
  });

  it('defaults the reference to the most used machine and marks running bests', () => {
    expect(defaultReferenceId(hammerToLife)).toBe('hammer');
    expect(
      runningBestIds([
        point('a', '2026-10-01', null, 80),
        point('b', '2026-10-08', null, 78),
        point('c', '2026-10-15', null, 85),
      ]),
    ).toEqual(new Set(['a', 'c']));
  });

  it('suggests a conversion from switches to and from the reference', () => {
    const data = progress([
      point('w1', '2026-09-01', 'hammer', 80),
      point('w2', '2026-09-08', 'life', 64),
      point('w3', '2026-09-15', 'life', 66),
      // Unpinned counts as the reference.
      point('w4', '2026-09-22', null, 84),
      point('w5', '2026-09-29', 'techno', 90),
      // Too long after the previous session to compare.
      point('w6', '2026-11-20', 'hammer', 86),
      point('w7', '2026-11-27', 'life', 70),
    ]);
    const suggestions = suggestFactors(data, 'hammer');
    // Ratios 80/64 = 1.25, 84/66 ≈ 1.27 and 86/70 ≈ 1.23: the median.
    expect(suggestions.get('life')).toEqual({ factor: 1.25, switches: 3 });
    // One switch is not enough.
    expect(suggestions.has('techno')).toBe(false);
    expect(suggestFactors(data, null).size).toBe(0);
    // Against Life Fitness, the unpinned session counts as Life Fitness: 64/80 and 70/86.
    expect(suggestFactors(data, 'life').get('hammer')).toEqual({ factor: 0.81, switches: 2 });
  });
});
