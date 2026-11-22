import { cardioRecordLabel } from './cardioRecords';
import { recordScopeLabel } from './recordScope';
import type { PersonalRecord } from './types';
import { formatWeight, recordDisplayValue, type WeightUnit } from './weightUnits';

// How personal records are named. Plain functions with no React or browser APIs: the web app and
// the native app (mobile/) both use them.

export function recordTypeLabel(record: Pick<PersonalRecord, 'record_type' | 'normalized_weight'>) {
  return (
    cardioRecordLabel(record) ??
    {
      weight: 'Weight PR',
      relative_strength: 'Relative strength PR',
      reps_at_weight: 'Volume PR for this weight',
      estimated_1rm: 'estimated 1RM PR',
    }[record.record_type as string] ??
    'PR'
  );
}

/** One record of a finished workout, such as "All-time Weight PR · 100 kg". */
export function completionRecordDetail(record: PersonalRecord, unit: WeightUnit): string {
  return [
    `${recordScopeLabel(record)} ${recordTypeLabel(record)} · ${recordDisplayValue(record, unit)}`,
    record.record_type === 'reps_at_weight' && record.weight_kg != null
      ? ` @ ${formatWeight(record.weight_kg, unit)}`
      : '',
    record.bodyweight_kg != null ? ` · at ${formatWeight(record.bodyweight_kg, unit)} BW` : '',
  ].join('');
}
