import { decimalNumberOrNull } from './utils';
import { weightInputKg, type WeightUnit } from './weightUnits';

// Train together: reading what someone types into a partner's set. Plain TypeScript with no
// packages or browser APIs, so the web and the app share it.

/** The largest weight (kg) and reps a set accepts, as the server's workout set does. */
export const PARTNER_SET_MAX = 10_000;

/** Empty clears the value; invalid text is kept on screen and never sent. */
export type PartnerInput =
  { kind: 'empty' } | { kind: 'value'; value: number } | { kind: 'invalid' };

/** Reps: a finite, non-negative whole number up to the limit. */
export function partnerRepsInput(text: string): PartnerInput {
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'empty' };
  if (!/^\d+$/.test(trimmed)) return { kind: 'invalid' };
  const value = Number(trimmed);
  return value <= PARTNER_SET_MAX ? { kind: 'value', value } : { kind: 'invalid' };
}

/**
 * A weight typed in the viewer's unit, as kilograms. An unchanged rounded value keeps the stored
 * precise kilograms (weightInputKg). Non-negative and within the limit.
 */
export function partnerWeightInput(
  text: string,
  unit: WeightUnit,
  originalKg: number | null,
): PartnerInput {
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'empty' };
  const typed = decimalNumberOrNull(trimmed);
  if (typed === null || !Number.isFinite(typed) || typed < 0) return { kind: 'invalid' };
  const kg = weightInputKg(trimmed, unit, originalKg);
  return kg !== null && kg <= PARTNER_SET_MAX ? { kind: 'value', value: kg } : { kind: 'invalid' };
}
