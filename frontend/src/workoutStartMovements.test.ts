import { describe, expect, it } from 'vitest';
import type { SessionTemplate } from './trainingSummary';
import type { Exercise, TrackedSet, TrackedWorkout } from './types';
import {
  emptyDraftSet,
  suggestedSetsForPickedExercise,
  suggestedSetsFromHistory,
  templateDraftMovements,
} from './workoutStartMovements';

const bench: Exercise = {
  id: 'bench',
  name: 'Bench Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};

function trackedSet(order: number, values: Partial<TrackedSet>): TrackedSet {
  return {
    id: `set-${order}`,
    order_index: order,
    reps: null,
    weight_kg: null,
    rpe: null,
    rest_seconds: null,
    duration_seconds: null,
    distance_km: null,
    incline_percent: null,
    speed_kph: null,
    bodyweight_kg: null,
    percentile: null,
    warmup: false,
    set_type: 'normal',
    failed: false,
    target_reps: null,
    notes: null,
    completed: true,
    ...values,
  };
}

const lastBench: TrackedWorkout = {
  id: 'last',
  name: 'Push workout',
  workout_date: '2026-11-18',
  category: 'push',
  notes: null,
  duration_minutes: 60,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: '2026-11-18T08:00:00Z',
  updated_at: '2026-11-18T08:00:00Z',
  movements: [
    {
      id: 'm1',
      order_index: 0,
      notes: null,
      exercise: bench,
      machine_photos: [],
      superset_group_id: null,
      superset_name: null,
      sets: [
        trackedSet(0, { reps: 10, weight_kg: 40, set_type: 'warmup', warmup: true }),
        trackedSet(1, { reps: 8, weight_kg: 80, rest_seconds: 180 }),
        trackedSet(2, { reps: 7, weight_kg: 80, rest_seconds: 180 }),
      ],
    },
  ],
};

function keys() {
  let next = 0;
  return () => `key-${++next}`;
}

describe('live workout start movements', () => {
  it('suggests the last session of an exercise, marked as suggestions', () => {
    const sets = suggestedSetsFromHistory(
      [lastBench],
      bench,
      '2026-11-22',
      undefined,
      null,
      null,
      keys(),
    );
    expect(sets.map((set) => [set.key, set.weight_kg, set.reps, set.set_type])).toEqual([
      ['key-1', 40, 10, 'warmup'],
      ['key-2', 80, 8, 'normal'],
      ['key-3', 80, 7, 'normal'],
    ]);
    expect(sets.every((set) => set.fromPrevious && !set.completed && !set.restRevealed)).toBe(true);
  });

  it('starts an exercise never done with one blank warm-up at the default rest', () => {
    const sets = suggestedSetsFromHistory([], bench, '2026-11-22', undefined, null, 90, keys());
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      key: 'key-1',
      set_type: 'warmup',
      reps: null,
      rest_seconds: 90,
      restRevealed: true,
    });
    expect(sets[0].fromPrevious).toBeUndefined();
  });

  it('copies the set before it for Add set', () => {
    const set = emptyDraftSet(
      'strength',
      { ...lastBench.movements[0].sets[1], completed: true },
      null,
      'added',
    );
    expect(set).toMatchObject({ key: 'added', weight_kg: 80, reps: 8, fromPrevious: true });
    expect(set.completed).toBe(false);
  });

  it('fills a planned day from the plan, then last time, then the rep range target', () => {
    const template: SessionTemplate['exercises'] = [
      {
        exercise: bench,
        topSet: null,
        summary: '3 sets',
        repRange: { min: 6, max: 8 },
        plannedSets: [
          {
            reps: 10,
            weight_kg: 40,
            duration_seconds: null,
            distance_km: null,
            rest_seconds: null,
            set_type: 'warmup',
          },
          {
            reps: 6,
            weight_kg: null,
            duration_seconds: null,
            distance_km: null,
            rest_seconds: null,
            set_type: 'normal',
          },
          {
            reps: 6,
            weight_kg: null,
            duration_seconds: null,
            distance_km: null,
            rest_seconds: null,
            set_type: 'normal',
          },
        ],
      },
    ];
    const [movement] = templateDraftMovements(template, {
      workouts: [lastBench],
      date: '2026-11-22',
      weightUnit: 'kg',
      defaultRest: 120,
      newKey: keys(),
    });
    expect(movement.repRange).toEqual({ min: 6, max: 8 });
    // Last time did not reach 8 reps on every top set, so the weight holds at 80 kg and each
    // row at that weight shows last time's reps.
    expect(movement.sets.map((set) => [set.weight_kg, set.reps, set.rest_seconds])).toEqual([
      [40, 10, 120],
      [80, 8, 180],
      [80, 7, 180],
    ]);
    expect(movement.sets.every((set) => set.fromPrevious)).toBe(true);
  });

  it('pre-fills a last-session template from history', () => {
    const [movement] = templateDraftMovements(
      [{ exercise: bench, topSet: null, summary: '80 kg × 8' }],
      {
        workouts: [lastBench],
        date: '2026-11-22',
        weightUnit: 'kg',
        defaultRest: null,
        newKey: keys(),
      },
    );
    expect(movement.sets.map((set) => set.reps)).toEqual([10, 8, 7]);
    expect(movement.repRange).toBeUndefined();
  });
});

describe('sets for an exercise picked with a machine', () => {
  const onMachine: TrackedWorkout = {
    ...lastBench,
    id: 'machine',
    workout_date: '2026-11-10',
    movements: [
      {
        ...lastBench.movements[0],
        machine_photos: [
          {
            id: 'press',
            exercise_id: 'bench',
            caption: 'Chest press',
            thumbnail_url: '',
            full_url: '',
            width: 800,
            height: 600,
            created_at: '2026-11-01T08:00:00Z',
          },
        ],
        sets: [trackedSet(0, { reps: 12, weight_kg: 55, rest_seconds: 90 })],
      },
    ],
  };

  it("starts from that machine's last session", () => {
    const sets = suggestedSetsForPickedExercise(
      [lastBench, onMachine],
      bench,
      '2026-11-20',
      undefined,
      null,
      null,
      'press',
      keys(),
    );
    expect(sets.map((set) => [set.weight_kg, set.reps])).toEqual([[55, 12]]);
  });

  it("falls back to the exercise's last session without a machine or its history", () => {
    for (const machine of [undefined, 'unused']) {
      const sets = suggestedSetsForPickedExercise(
        [lastBench, onMachine],
        bench,
        '2026-11-20',
        undefined,
        null,
        null,
        machine,
        keys(),
      );
      expect(sets.map((set) => set.weight_kg)).toEqual([40, 80, 80]);
    }
  });
});
