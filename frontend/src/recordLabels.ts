import { cardioRecordLabel } from './cardioRecords';
import { recordScopeLabel } from './recordScope';
import type { PersonalRecord } from './types';
import { formatWeight, recordDisplayValue, type WeightUnit } from './weightUnits';

// How personal records are named. Plain functions with no React or browser APIs: the web app and
// the native app (mobile/) both use them. Keep this file and its imports free of packages and DOM
// access; the mobile checks build them too.

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

// Home's Recent records name the kind without the estimated-1RM wording, as the web always has.
const RECORD_LABELS: Partial<Record<PersonalRecord['record_type'], string>> = {
  relative_strength: 'Relative strength PR',
  reps_at_weight: 'Volume PR for this weight',
  weight: 'Weight PR',
};

/** What a record is, such as "Weight PR", "Volume PR for this weight @ 80 kg" or a cardio best. */
export function recordKindLabel(
  record: Pick<PersonalRecord, 'record_type' | 'weight_kg' | 'normalized_weight'>,
  unit: WeightUnit,
) {
  const name = cardioRecordLabel(record) ?? RECORD_LABELS[record.record_type] ?? 'PR';
  return record.record_type === 'reps_at_weight' && record.weight_kg != null
    ? `${name} @ ${formatWeight(record.weight_kg, unit)}`
    : name;
}
