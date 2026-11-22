import { describe, expect, it } from 'vitest';
import { completionRecordDetail, recordTypeLabel } from './recordLabels';
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
});
