import type { BodyMeasurement } from './types';

export type CheckInValues = Pick<
  BodyMeasurement,
  'measurement_date' | 'weight_kg' | 'body_fat_pct' | 'notes'
>;

/** What a date's check-in should end up as on the server: these values, or null to remove it. */
export interface CheckInChange {
  date: string;
  payload: CheckInValues | null;
}

// The server trims notes and stores an empty one as none.
const savedNotes = (notes: string | null | undefined) => notes?.trim() || null;

/**
 * Whether the server already holds what a waiting change asks for: the same values on that date,
 * or no check-in there for a removal. A save can reach the server without its answer reaching
 * the device (a timeout, a dropped connection, the app closing), and the change then still waits
 * on the device. Sending it again would only repeat work the server has done.
 */
export function serverHasCheckIn(
  change: CheckInChange,
  rows: readonly (CheckInValues & Pick<BodyMeasurement, 'is_sample'>)[],
): boolean {
  const saved = rows.find((row) => row.measurement_date === change.date);
  const wanted = change.payload;
  if (!wanted) return !saved;
  return (
    saved !== undefined &&
    // Saving over a sample check-in makes it the person's own, which is still to be done.
    !saved.is_sample &&
    saved.weight_kg === wanted.weight_kg &&
    (saved.body_fat_pct ?? null) === (wanted.body_fat_pct ?? null) &&
    savedNotes(saved.notes) === savedNotes(wanted.notes)
  );
}
