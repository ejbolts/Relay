import { describe, expect, it } from 'vitest';
import {
  exerciseProgressView,
  exerciseRecordWorkoutIds,
  rangeOutgrowsBlock,
  withNormalisedRelativeStrength,
} from './exerciseProgressScope';
import type {
  ExerciseProgress,
  MachineProgressPoint,
  PersonalRecord,
  WeightMapping,
} from './types';

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

describe('exerciseProgressView', () => {
  const session = (id: string, machine: string | null, weight: number): MachineProgressPoint => ({
    workout_id: id,
    workout_date: `2026-11-${id}`,
    machine_photo_id: machine,
    best_weight_kg: weight,
    best_reps: 8,
    estimated_1rm: weight * 1.25,
    volume_kg: weight * 24,
    best_rpe: null,
  });
  const machine = (id: string, workouts: number) => ({
    id,
    caption: id === 'hammer' ? 'Hammer' : 'Cybex',
    thumbnail_url: '',
    workout_count: workouts,
    last_used_date: null,
    machine_kg: id === 'cybex' ? 150 : null,
    reference_kg: id === 'cybex' ? 120 : null,
  });
  const sessions = [session('10', 'cybex', 150), session('17', 'hammer', 125)];
  const progress = {
    exercise: { id: 'press' },
    // Every session on one machine, so all machines shows the same sessions.
    points: sessions,
    machine_points: sessions,
    personal_best_weight_kg: 150,
    personal_best_estimated_1rm: 187.5,
  } as unknown as ExerciseProgress;
  const off: WeightMapping = {
    enabled: false,
    reference_machine_id: 'hammer',
    machines: [machine('cybex', 1), machine('hammer', 3)],
  };
  const records = new Set(['17']);

  it('shows every machine as logged by default, marking the counted records', () => {
    const view = exerciseProgressView(progress, off, 'all', records);
    expect(view).toMatchObject({ view: 'all', normalised: false, defaultView: true, approx: '' });
    expect(view.machineOptions.map((item) => item.id)).toEqual(['hammer', 'cybex']);
    expect(view.heaviest?.workout_id).toBe('10');
    expect(view.bestEstimatedOneRepMax).toBe(187.5);
    expect(view.recordIds).toBe(records);
  });

  it('converts All machines to the reference machine while normalising', () => {
    const view = exerciseProgressView(progress, { ...off, enabled: true }, 'all', records);
    expect(view).toMatchObject({ normalised: true, defaultView: false, approx: '≈ ' });
    expect(view.referenceMachine?.caption).toBe('Hammer');
    // 150 kg on the Cybex is 120 kg on the Hammer, so the Hammer's 125 kg is heavier.
    expect(view.heaviest).toMatchObject({ workout_id: '17', best_weight_kg: 125 });
    expect(view.points[0]).toMatchObject({ best_weight_kg: 120, raw_best_weight_kg: 150 });
    expect(view.bestEstimatedOneRepMax).toBe(156.3);
    expect([...view.recordIds]).toEqual(['10', '17']);
  });

  it('shows one machine as logged, and falls back to all without its sessions', () => {
    const cybex = exerciseProgressView(progress, off, 'cybex', records);
    expect(cybex.points.map((point) => point.workout_id)).toEqual(['10']);
    expect(cybex.defaultView).toBe(false);
    expect(exerciseProgressView(progress, off, 'gone', records).view).toBe('all');
    expect(exerciseProgressView(null, off, 'cybex', records)).toMatchObject({
      view: 'all',
      points: [],
      heaviest: null,
    });
  });

  it('marks the workouts with a counted record, in the chosen block', () => {
    const record = (workout: string, date: string, scope = 'all_time') =>
      ({
        exercise_id: 'press',
        workout_id: workout,
        achieved_date: date,
        scope,
        record_type: 'weight',
        value: 100,
      }) as unknown as PersonalRecord;
    const all = [record('10', '2026-11-10'), record('17', '2026-11-17', 'block')];
    expect([...exerciseRecordWorkoutIds(all, null, 'press')]).toEqual(['10']);
    const block = { id: 'b', name: 'B', start_date: '2026-11-15', end_date: null };
    expect([...exerciseRecordWorkoutIds(all, block, 'press')]).toEqual(['17']);
  });
});
