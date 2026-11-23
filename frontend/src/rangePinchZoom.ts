import { useCallback, useMemo, useRef, useState } from 'react';
import type { TimeRange } from './dateRanges';
import { dateBounds, pinchStep, spanStartDate, timeRangeSpans } from './rangePinchSpans';

export { nearestTimeRange, pinchedSpan, spanStartDate, timeRangeSpans } from './rangePinchSpans';

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
  const { earliest, latest } = dateBounds(dates);
  const spans = useMemo(() => timeRangeSpans(earliest, latest), [earliest, latest]);
  const pinchZoom = useMemo(
    () => ({
      onChange: (scale: number) => {
        baseSpanRef.current ??= spans[range];
        const step = pinchStep(baseSpanRef.current, scale, spans);
        setSpanDays(step.spanDays);
        setRange(step.range);
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
