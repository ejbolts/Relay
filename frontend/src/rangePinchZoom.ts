import { useCallback, useMemo, useRef, useState } from 'react';
import { dateRangeForDates, TIME_RANGE_OPTIONS, type TimeRange } from './dateRanges';

const DAY_MS = 86_400_000;

function dateOnlyUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function daysBetween(start: string, end: string): number {
  return Math.round((dateOnlyUtc(end).getTime() - dateOnlyUtc(start).getTime()) / DAY_MS);
}

/**
 * How many days each range chip shows, measured back from the latest date. "All" is at least
 * half again as long as a year, so pinching out past a year still reaches it.
 */
export function timeRangeSpans(earliest: string, latest: string): Record<TimeRange, number> {
  const spans = {} as Record<TimeRange, number>;
  for (const option of TIME_RANGE_OPTIONS) {
    if (option.months === null) continue;
    const { start_date: start } = dateRangeForDates(latest ? [latest] : [], option.value);
    spans[option.value] = start ? daysBetween(start, latest) : option.months * 30.4;
  }
  spans.all = Math.max(latest ? daysBetween(earliest, latest) : 0, spans['1y'] * 1.5);
  return spans;
}

/** The chip whose span is closest on a log scale, so each chip owns an equal zoom band. */
export function nearestTimeRange(spanDays: number, spans: Record<TimeRange, number>): TimeRange {
  let nearest: TimeRange = TIME_RANGE_OPTIONS[0].value;
  for (const option of TIME_RANGE_OPTIONS) {
    const distance = Math.abs(Math.log(spanDays / spans[option.value]));
    if (distance < Math.abs(Math.log(spanDays / spans[nearest]))) nearest = option.value;
  }
  return nearest;
}

/**
 * Shrinking or widening a span by a pinch factor, kept between a few weeks and "All". The
 * span changes faster than the finger distance, so one pinch can cross from a month to "All".
 */
export function pinchedSpan(
  baseSpanDays: number,
  scale: number,
  spans: Record<TimeRange, number>,
): number {
  const minimum = spans['1m'] * 0.7;
  const span = baseSpanDays / Math.max(scale, 0.01) ** 1.5;
  return Math.min(spans.all, Math.max(minimum, span));
}

/** The first date inside a window of `spanDays` ending on `latest`. */
export function spanStartDate(latest: string, spanDays: number): string {
  const start = dateOnlyUtc(latest);
  start.setUTCDate(start.getUTCDate() - Math.round(spanDays));
  return start.toISOString().slice(0, 10);
}

/**
 * Pinch zoom for a chart with range chips. While a pinch is in progress the chart shows
 * `pinchStart` onwards and the nearest chip is selected; releasing snaps to that chip.
 */
export function useRangePinchZoom(
  dates: string[],
  range: TimeRange,
  setRange: (range: TimeRange) => void,
) {
  const [spanDays, setSpanDays] = useState<number | null>(null);
  const baseSpanRef = useRef<number | null>(null);
  let earliest = dates[0] ?? '';
  let latest = earliest;
  for (const date of dates) {
    if (date < earliest) earliest = date;
    if (date > latest) latest = date;
  }
  const spans = useMemo(() => timeRangeSpans(earliest, latest), [earliest, latest]);
  const pinchZoom = useMemo(
    () => ({
      onChange: (scale: number) => {
        baseSpanRef.current ??= spans[range];
        const span = pinchedSpan(baseSpanRef.current, scale, spans);
        setSpanDays(span);
        setRange(nearestTimeRange(span, spans));
      },
      onEnd: () => {
        baseSpanRef.current = null;
        setSpanDays(null);
      },
    }),
    [range, setRange, spans],
  );
  const selectRange = useCallback(
    (next: TimeRange) => {
      baseSpanRef.current = null;
      setSpanDays(null);
      setRange(next);
    },
    [setRange],
  );
  const pinching = spanDays !== null && latest !== '';
  return {
    pinchZoom,
    pinching,
    /** The first date shown while pinching; undefined when not pinching. */
    pinchStart: pinching ? spanStartDate(latest, spanDays) : undefined,
    /** Select a chip directly, ending any pinch view. */
    selectRange,
  };
}
