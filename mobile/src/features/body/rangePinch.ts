import { useMemo, useRef, useState } from 'react';
import type { TimeRange } from '../../../../frontend/src/dateRanges';
import {
  dateBounds,
  pinchStep,
  spanStartDate,
  timeRangeSpans,
} from '../../../../frontend/src/rangePinchSpans';

/**
 * Pinch zoom for a chart with range chips, as the web's useRangePinchZoom: while pinching the
 * chart shows `pinchStart` onwards and the nearest chip is selected; letting go keeps that chip.
 */
export function useRangePinch(
  dates: string[],
  range: TimeRange,
  setRange: (range: TimeRange) => void,
) {
  const [spanDays, setSpanDays] = useState<number | null>(null);
  // The span showing when the pinch began, so a refresh mid-gesture can't move it.
  const base = useRef<number | null>(null);
  const { earliest, latest } = dateBounds(dates);
  const spans = useMemo(() => timeRangeSpans(earliest, latest), [earliest, latest]);
  const pinching = spanDays !== null && latest !== '';
  return {
    onPinch: (scale: number) => {
      base.current ??= spans[range];
      const step = pinchStep(base.current, scale, spans);
      setSpanDays(step.spanDays);
      if (step.range !== range) setRange(step.range);
    },
    onPinchEnd: () => {
      base.current = null;
      setSpanDays(null);
    },
    /** The first date shown while pinching; undefined otherwise. */
    pinchStart: pinching ? spanStartDate(latest, spanDays) : undefined,
  };
}
