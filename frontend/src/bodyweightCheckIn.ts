import { api } from './api';
import {
  saveBodyFatCheckInWith,
  saveBodyweightCheckInWith,
  type UndoBodyweightCheckIn,
} from './bodyCheckInUndo';
import type { BodyMeasurement } from './types';

export type { UndoBodyweightCheckIn };

/** Save immediately; undo restores the complete previous entry or removes a new one. */
export function saveBodyweightCheckIn(
  previous: BodyMeasurement | null,
  date: string,
  weight: number,
  bodyFat?: number,
): Promise<UndoBodyweightCheckIn> {
  return saveBodyweightCheckInWith(api, previous, date, weight, bodyFat);
}

/** Add body fat to today's recorded weight; undo changes only body fat. */
export function saveBodyFatCheckIn(
  previous: BodyMeasurement | null,
  date: string,
  bodyFat: number,
): Promise<UndoBodyweightCheckIn> {
  return saveBodyFatCheckInWith(api, previous, date, bodyFat);
}
