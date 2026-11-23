import { describe, expect, it } from 'vitest';
import { formatProfileTotal } from './profileDisplay';
import { completionRecordDetail, recordKindLabel, recordTypeLabel } from './recordLabels';
import type { PersonalRecord } from './types';

const record: PersonalRecord = {
  id: 'r1',
  exercise_id: 'bench',
  workout_id: 'w1',
  set_id: 's1',
  achieved_date: '2026-11-22',
  record_type: 'reps_at_weight',
  value: 9,
  unit: 'reps',
  normalized_weight: 80,
  weight_kg: 80,
  formula: null,
  exercise_name: 'Bench Press',
};

const kindRecord = (overrides: Partial<PersonalRecord>) =>
  ({ record_type: 'weight', weight_kg: null, normalized_weight: null, ...overrides }) as Pick<
    PersonalRecord,
    'record_type' | 'weight_kg' | 'normalized_weight'
  >;

describe('record labels', () => {
  it('names strength, cardio and unknown records', () => {
    expect(recordTypeLabel({ record_type: 'weight', normalized_weight: null })).toBe('Weight PR');
    expect(recordTypeLabel({ record_type: 'distance', normalized_weight: null })).toBe(
      'Distance PR',
    );
    expect(
      recordTypeLabel({
        record_type: 'unknown' as PersonalRecord['record_type'],
        normalized_weight: null,
      }),
    ).toBe('PR');
  });

  it('describes a finished workout record with its weight and bodyweight', () => {
    expect(completionRecordDetail({ ...record, bodyweight_kg: 82 }, 'kg')).toBe(
      'All-time Volume PR for this weight · 9 reps @ 80 kg · at 82 kg BW',
    );
    expect(completionRecordDetail({ ...record, scope: 'block' }, 'lb')).toBe(
      'Block Volume PR for this weight · 9 reps @ 176.37 lb',
    );
  });

  it('names a record kind for Home, with its weight', () => {
    expect(recordKindLabel(kindRecord({ record_type: 'weight' }), 'kg')).toBe('Weight PR');
    expect(recordKindLabel(kindRecord({ record_type: 'relative_strength' }), 'kg')).toBe(
      'Relative strength PR',
    );
    expect(
      recordKindLabel(kindRecord({ record_type: 'reps_at_weight', weight_kg: 80 }), 'kg'),
    ).toBe('Volume PR for this weight @ 80 kg');
    expect(recordKindLabel(kindRecord({ record_type: 'distance' }), 'kg')).toBe('Distance PR');
    expect(recordKindLabel(kindRecord({ record_type: 'pace', normalized_weight: 5 }), 'kg')).toBe(
      'Fastest 5 km',
    );
    expect(recordKindLabel(kindRecord({ record_type: 'estimated_1rm' }), 'kg')).toBe('PR');
  });

  it('formats profile totals', () => {
    expect(formatProfileTotal(1204)).toBe((1204).toLocaleString());
    expect(formatProfileTotal(null)).toBe('–');
    expect(formatProfileTotal(undefined)).toBe('–');
  });
});
