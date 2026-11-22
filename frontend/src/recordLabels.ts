import { cardioRecordLabel } from './cardioRecords';
import type { PersonalRecord } from './types';
import { formatWeight, type WeightUnit } from './weightUnits';

// Plain functions with no React or browser APIs: Home's Recent records on the web and in the
// native app (mobile/) both name records here. Keep this file and its imports free of packages
// and DOM access; the mobile checks build them too.

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
