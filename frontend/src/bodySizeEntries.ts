import type { BodyFigureKind } from './bodyFigureShapes';
import { BODY_SIZE_FIELDS, type BodySizeField, type BodySizeLog } from './bodySizes';
import type { Sex } from './types';
import type { WeightUnit } from './weightUnits';

/**
 * The rules behind the body measurements card. Logs are kept newest first and store centimetres;
 * an account that weighs in pounds sees and types inches.
 */
export interface BodySizeUnit {
  unit: 'cm' | 'in';
  /** Centimetres per shown unit. */
  factor: number;
}

export type BodySizeDraft = Record<BodySizeField, string>;

export function bodySizeUnit(weightUnit: WeightUnit): BodySizeUnit {
  return weightUnit === 'lb' ? { unit: 'in', factor: 2.54 } : { unit: 'cm', factor: 1 };
}

/** A measurement as typed into a box: up to two decimals, no trailing zeros. */
export function bodySizeEditText(cm: number, { factor }: BodySizeUnit): string {
  return String(Number((cm / factor).toFixed(2)));
}

/** A measurement as shown, to one decimal. */
export function bodySizeShown(cm: number, { factor }: BodySizeUnit): number {
  return Number((cm / factor).toFixed(1));
}

/** "38.5 cm" */
export function formatBodySize(cm: number, size: BodySizeUnit): string {
  return `${bodySizeShown(cm, size)} ${size.unit}`;
}

export function emptyBodySizeLog(date: string): BodySizeLog {
  return {
    ...Object.fromEntries(BODY_SIZE_FIELDS.map(([key]) => [key, null])),
    measurement_date: date,
  } as BodySizeLog;
}

export const newestBodySizesFirst = (a: BodySizeLog, b: BodySizeLog) =>
  b.measurement_date.localeCompare(a.measurement_date);

/** The logs with `entry` in place of any log on its date, newest first. */
export function withBodySizeLog(logs: BodySizeLog[] | null, entry: BodySizeLog): BodySizeLog[] {
  return [
    entry,
    ...(logs ?? []).filter((row) => row.measurement_date !== entry.measurement_date),
  ].sort(newestBodySizesFirst);
}

/** The form's boxes for a day: its saved values, or empty. */
export function bodySizeDraft(
  logs: BodySizeLog[] | null,
  date: string,
  size: BodySizeUnit,
): BodySizeDraft {
  const row = logs?.find((item) => item.measurement_date === date);
  return Object.fromEntries(
    BODY_SIZE_FIELDS.map(([key]) => [
      key,
      row?.[key] == null ? '' : bodySizeEditText(row[key], size),
    ]),
  ) as BodySizeDraft;
}

export function bodySizeRangeError(label: string, { unit, factor }: BodySizeUnit): string {
  return `${label} must be above 0 and up to ${Number((300 / factor).toFixed(2))} ${unit}.`;
}

const outOfRange = (cm: number | null) =>
  cm !== null && (!Number.isFinite(cm) || cm <= 0 || cm > 300);

/**
 * The day's entry the form saves, or why it can't. It starts from the stored entry, so a part
 * no longer offered (ankle) is kept, and an untouched value stays exact when shown rounded.
 */
export function bodySizesPayload(
  stored: BodySizeLog | undefined,
  date: string,
  draft: Partial<BodySizeDraft>,
  size: BodySizeUnit,
): { error: string; payload?: undefined } | { error: null; payload: BodySizeLog } {
  const payload = { ...stored, measurement_date: date } as BodySizeLog;
  for (const [key, label] of BODY_SIZE_FIELDS) {
    const text = draft[key]?.trim();
    const original = stored?.[key];
    const unchanged = original != null && text === bodySizeEditText(original, size);
    payload[key] = unchanged ? original : text ? Number(text) * size.factor : null;
    if (outOfRange(payload[key])) return { error: bodySizeRangeError(label, size) };
  }
  if (!BODY_SIZE_FIELDS.some(([key]) => payload[key] !== null)) {
    return { error: 'Enter at least one body measurement.' };
  }
  return { error: null, payload };
}

/**
 * One measurement typed on the figure, saved into `day`'s entry (started if needed), so an
 * earlier entry only changes through Edit. Confirming the shown value unchanged saves nothing.
 */
export function figureEntry({
  logs,
  day,
  field,
  typed,
  shownCm,
  size,
}: {
  logs: BodySizeLog[] | null;
  day: string;
  field: BodySizeField;
  typed: string;
  /** What the box started with. */
  shownCm: number | undefined;
  size: BodySizeUnit;
}):
  | { kind: 'unchanged' }
  | { kind: 'invalid'; error: string }
  | { kind: 'save'; entry: BodySizeLog } {
  const text = typed.trim().replace(',', '.');
  if (!text || (shownCm != null && text === bodySizeEditText(shownCm, size)))
    return { kind: 'unchanged' };
  const value = Number(text) * size.factor;
  if (!Number.isFinite(value) || value <= 0 || value > 300) {
    const label = BODY_SIZE_FIELDS.find(([key]) => key === field)![1];
    return { kind: 'invalid', error: bodySizeRangeError(label, size) };
  }
  const entry = logs?.find((row) => row.measurement_date === day) ?? emptyBodySizeLog(day);
  return { kind: 'save', entry: { ...entry, [field]: value } };
}

/**
 * What the figure shows for the entry at `shownIndex`: its values, and for parts it lacks the
 * latest earlier value, marked as carried, so it stays complete without copying old values.
 */
export function bodyFigureValues(logs: BodySizeLog[] | null, shownIndex: number) {
  const shown = logs?.[shownIndex];
  const values: Partial<Record<BodySizeField, number>> = {};
  const carried = new Set<BodySizeField>();
  for (const [key] of BODY_SIZE_FIELDS) {
    if (shown?.[key] != null) values[key] = shown[key]!;
    else {
      const earlier = logs?.slice(shownIndex + 1).find((row) => row[key] != null)?.[key];
      if (earlier != null) {
        values[key] = earlier;
        carried.add(key);
      }
    }
  }
  return { values, carried };
}

/** Parts that changed between two entries, in shown units. */
export function bodySizeChanges(
  shown: BodySizeLog | undefined,
  previous: BodySizeLog | undefined,
  size: BodySizeUnit,
): { key: BodySizeField; label: string; change: number }[] {
  return BODY_SIZE_FIELDS.flatMap(([key, label]) => {
    if (shown?.[key] == null || previous?.[key] == null) return [];
    const change = Number(
      (bodySizeShown(shown[key], size) - bodySizeShown(previous[key], size)).toFixed(1),
    );
    return change === 0 ? [] : [{ key, label, change }];
  });
}

/** The history, or only the entries that measured one part. */
export function bodySizeHistory(logs: BodySizeLog[] | null, part: BodySizeField | 'all') {
  return (logs ?? []).filter((row) => part === 'all' || row[part] !== null);
}

/** A filtered history row's change from the row below it. */
export function bodySizeChangeText(
  history: BodySizeLog[],
  index: number,
  part: BodySizeField | 'all',
  { unit, factor }: BodySizeUnit,
): string {
  if (part === 'all' || !history[index + 1]) return 'First measurement';
  const current = Number((history[index][part]! / factor).toFixed(1));
  const previous = Number((history[index + 1][part]! / factor).toFixed(1));
  const change = Number((current - previous).toFixed(1));
  return change === 0 ? 'No change' : `${change > 0 ? '+' : '−'}${Math.abs(change)} ${unit}`;
}

/** Every part an entry measured: "Neck 38 cm · Waist 81.5 cm". */
export function bodySizeSummary(row: BodySizeLog, size: BodySizeUnit): string {
  return BODY_SIZE_FIELDS.filter(([key]) => row[key] !== null)
    .map(([key, label]) => `${label} ${formatBodySize(row[key]!, size)}`)
    .join(' · ');
}

/** The most recent measurement of a part before `date`, as a hint to type over. */
export function bodySizeLastValue(
  logs: BodySizeLog[] | null,
  date: string,
  key: BodySizeField,
  size: BodySizeUnit,
): string | undefined {
  const cm = logs?.find((row) => row.measurement_date < date && row[key] != null)?.[key];
  return cm == null ? undefined : String(bodySizeShown(cm, size));
}

/** A member's outline kind: female only when set to female, otherwise male. */
export function bodyFigureKindForSex(sex: Sex | null | undefined): BodyFigureKind {
  return sex === 'female' ? 'female' : 'male';
}

/** One shared entry's measured fields, formatted in the viewer's unit without carrying earlier values. */
export function sharedBodyFigureValues(
  entry: BodySizeLog,
  size: BodySizeUnit,
): Partial<Record<BodySizeField, string>> {
  return Object.fromEntries(
    BODY_SIZE_FIELDS.filter(([key]) => entry[key] != null).map(([key]) => [
      key,
      String(bodySizeShown(entry[key]!, size)),
    ]),
  );
}
