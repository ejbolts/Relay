import type { PersonalRecord, TrainingPreferences } from './types';
import { decimalNumberOrNull } from './utils';

export type WeightUnit = TrainingPreferences['preferred_weight_unit'];
// Match the server and the CSV round-trip contract. All stored weights remain kg.
export const KG_TO_LB = 2.2046226218;

export function weightFromKg(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kg * KG_TO_LB : kg;
}

export function weightToKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value / KG_TO_LB : value;
}

export function weightUnitName(unit: WeightUnit): string {
  return unit === 'lb' ? 'pounds' : 'kilograms';
}

export function weightInputValue(kg: number | null, unit: WeightUnit): string {
  return kg === null ? '' : String(Number(weightFromKg(kg, unit).toFixed(2)));
}

/** Unchanged rounded display values must never rewrite the precise stored kg value. */
export function weightInputKg(
  value: string,
  unit: WeightUnit,
  originalKg: number | null = null,
): number | null {
  const parsed = decimalNumberOrNull(value);
  if (parsed === null) return null;
  if (originalKg !== null && parsed === Number(weightInputValue(originalKg, unit))) {
    return originalKg;
  }
  return weightToKg(parsed, unit);
}

export function formatWeightNumber(kg: number, unit: WeightUnit, decimals = 2): string {
  return Number(weightFromKg(kg, unit).toFixed(decimals)).toLocaleString('en-GB');
}

export function formatWeight(kg: number, unit: WeightUnit, decimals = 2): string {
  return `${formatWeightNumber(kg, unit, decimals)} ${unit}`;
}

/** PR responses already carry their display unit; convert from that unit only once. */
export function recordDisplayValue(
  record: Pick<PersonalRecord, 'value' | 'unit'>,
  unit: WeightUnit,
): string {
  if (record.unit === '× BW') return `${record.value.toFixed(2)}× BW`;
  if (record.unit !== 'kg' && record.unit !== 'lb') {
    return `${Number(record.value.toFixed(1))} ${record.unit}`;
  }
  return formatWeight(weightToKg(record.value, record.unit), unit, 1);
}
