import { describe, expect, it } from 'vitest';
import { formatProfileTotal } from './profileDisplay';
import { recordKindLabel } from './recordLabels';
import type { PersonalRecord } from './types';

const record = (overrides: Partial<PersonalRecord>) =>
  ({ record_type: 'weight', weight_kg: null, normalized_weight: null, ...overrides }) as Pick<
    PersonalRecord,
    'record_type' | 'weight_kg' | 'normalized_weight'
  >;

describe('record labels', () => {
  it('names strength and cardio records', () => {
    expect(recordKindLabel(record({ record_type: 'weight' }), 'kg')).toBe('Weight PR');
    expect(recordKindLabel(record({ record_type: 'relative_strength' }), 'kg')).toBe(
      'Relative strength PR',
    );
    expect(recordKindLabel(record({ record_type: 'reps_at_weight', weight_kg: 80 }), 'kg')).toBe(
      'Volume PR for this weight @ 80 kg',
    );
    expect(recordKindLabel(record({ record_type: 'distance' }), 'kg')).toBe('Distance PR');
    expect(recordKindLabel(record({ record_type: 'pace', normalized_weight: 5 }), 'kg')).toBe(
      'Fastest 5 km',
    );
    expect(recordKindLabel(record({ record_type: 'estimated_1rm' }), 'kg')).toBe('PR');
  });

  it('formats profile totals', () => {
    expect(formatProfileTotal(1204)).toBe((1204).toLocaleString());
    expect(formatProfileTotal(null)).toBe('–');
    expect(formatProfileTotal(undefined)).toBe('–');
  });
});
