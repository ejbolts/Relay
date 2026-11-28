/** Small helpers shared by App.tsx and the screens that live in their own files. */
import type { BodyTrendRange } from './bodyTrend';

export const HISTORY_PAGE_SIZE = 8;

export function numberOrNull(value: string): number | null {
  return value === '' ? null : Number(value);
}

/** A typed count: its digits as a whole number, or null when it has none. */
export function wholeNumberOrNull(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
}

// Building a formatter is far slower than using one, and the calendar formats thousands of days.
const prettyDateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function prettyDate(value: string): string {
  return prettyDateFormat.format(new Date(`${value}T12:00:00`));
}

export const RANGE_LABELS: Record<BodyTrendRange, string> = {
  '1m': '1M',
  '3m': '3M',
  '9m': '9M',
  '1y': '1Y',
  all: 'All',
};
