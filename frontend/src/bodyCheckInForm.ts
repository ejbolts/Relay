import type { BodyCheckInPayload } from './bodyCheckInUndo';
import type { BodyMeasurement } from './types';
import { formatWeight, type WeightUnit } from './weightUnits';

/** The note a CSV import leaves on a check-in; editing the check-in drops it. */
export const IMPORTED_BODYWEIGHT_NOTE = 'Imported from workout CSV.';

export interface WeighInDraft {
  weight: number | null;
  bodyFat: string;
  notes: string;
}

/** The fields for a day: its saved check-in, so saving changes it instead of wiping it. */
export function weighInDraft(entry: BodyMeasurement | undefined): WeighInDraft {
  return {
    weight: entry?.weight_kg ?? null,
    bodyFat: entry?.body_fat_pct == null ? '' : String(entry.body_fat_pct),
    notes: entry?.notes && entry.notes !== IMPORTED_BODYWEIGHT_NOTE ? entry.notes : '',
  };
}

function validWeight(weight: number | null): weight is number {
  return weight !== null && Number.isFinite(weight) && weight > 0 && weight <= 500;
}

const weightError = (unit: WeightUnit) =>
  `Enter a body weight above 0 and up to ${formatWeight(500, unit)}.`;

type Checked =
  { error: string; payload?: undefined } | { error: null; payload: BodyCheckInPayload };

/** What the weigh-in form saves for a day, or why it can't. */
export function weighInPayload(date: string, draft: WeighInDraft, unit: WeightUnit): Checked {
  if (!validWeight(draft.weight)) return { error: weightError(unit) };
  return {
    error: null,
    payload: {
      measurement_date: date,
      weight_kg: draft.weight,
      body_fat_pct: draft.bodyFat ? Number(draft.bodyFat) : null,
      notes: draft.notes.trim() || null,
    },
  };
}

/** An edited check-in's new weight and body fat, keeping its date and note, or why it can't save. */
export function checkInEditPayload(
  measurement: Pick<BodyMeasurement, 'measurement_date' | 'notes'>,
  weight: number | null,
  bodyFatText: string,
  unit: WeightUnit,
): Checked {
  const bodyFat = bodyFatText.trim() ? Number(bodyFatText) : null;
  if (!validWeight(weight)) return { error: weightError(unit) };
  if (bodyFat !== null && (!Number.isFinite(bodyFat) || bodyFat < 1 || bodyFat > 70)) {
    return { error: 'Enter a body-fat percentage between 1 and 70, or leave it blank.' };
  }
  return {
    error: null,
    payload: {
      measurement_date: measurement.measurement_date,
      weight_kg: weight,
      body_fat_pct: bodyFat,
      notes: measurement.notes === IMPORTED_BODYWEIGHT_NOTE ? null : measurement.notes,
    },
  };
}
