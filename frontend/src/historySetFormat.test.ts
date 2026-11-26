import { describe, expect, it } from 'vitest';
import { recordTypeLabel, setResult } from './historySetFormat';
import type { TrackedSet } from './types';

function set(fields: Partial<TrackedSet>): TrackedSet {
  return {
    id: 'set',
    order_index: 0,
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
    ...fields,
  };
}

describe('history set results', () => {
  it('reads a lift as weight × reps in the chosen unit', () => {
    expect(setResult(set({ weight_kg: 100, reps: 5 }), 'kg')).toBe('100 kg × 5');
    expect(setResult(set({ weight_kg: 100, reps: null }), 'lb')).toBe('220.46 lb × –');
  });

  it('reads a bodyweight set, saved at 0 kg, as its reps', () => {
    expect(setResult(set({ weight_kg: 0, reps: 12 }), 'kg')).toBe('12 reps');
  });

  it('joins what a cardio set logged', () => {
    expect(
      setResult(
        set({ duration_seconds: 1830, distance_km: 4.8, incline_percent: 6, speed_kph: 9.5 }),
        'kg',
      ),
    ).toBe('30:30 · 4.8 km · 6% incline · 9.5 km/h');
  });

  it('falls back to reps when nothing else was logged', () => {
    expect(setResult(set({}), 'kg')).toBe('– reps');
  });
});

describe('record names', () => {
  it('names strength records', () => {
    expect(recordTypeLabel({ record_type: 'weight', normalized_weight: null })).toBe('Weight PR');
    expect(recordTypeLabel({ record_type: 'reps_at_weight', normalized_weight: 80 })).toBe(
      'Volume PR for this weight',
    );
    expect(recordTypeLabel({ record_type: 'relative_strength', normalized_weight: null })).toBe(
      'Relative strength PR',
    );
  });

  it('names cardio records by their distance', () => {
    expect(recordTypeLabel({ record_type: 'pace', normalized_weight: 5 })).toBe('Fastest 5 km');
    expect(recordTypeLabel({ record_type: 'distance', normalized_weight: null })).toBe(
      'Distance PR',
    );
  });
});
