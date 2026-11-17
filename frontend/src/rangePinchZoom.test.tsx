// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { TimeRange } from './dateRanges';
import {
  nearestTimeRange,
  pinchedSpan,
  spanStartDate,
  timeRangeSpans,
  useRangePinchZoom,
} from './rangePinchZoom';

describe('pinch zooming a ranged chart', () => {
  const spans = timeRangeSpans('2025-01-10', '2026-11-16');

  it('measures each chip back from the latest date', () => {
    expect(spans['1m']).toBe(31);
    expect(spans['3m']).toBe(92);
    expect(spans['1y']).toBe(365);
    expect(spans.all).toBe(675);
  });

  it('gives "All" room beyond a year when the history is short', () => {
    expect(timeRangeSpans('2026-11-13', '2026-11-16').all).toBe(365 * 1.5);
  });

  it('selects the chip nearest the pinched span', () => {
    expect(nearestTimeRange(25, spans)).toBe('1m');
    expect(nearestTimeRange(60, spans)).toBe('3m');
    expect(nearestTimeRange(200, spans)).toBe('9m');
    expect(nearestTimeRange(330, spans)).toBe('1y');
    expect(nearestTimeRange(600, spans)).toBe('all');
  });

  it('zooms in when the fingers spread and out when they close', () => {
    expect(pinchedSpan(92, 2, spans)).toBeCloseTo(32.5, 1);
    expect(pinchedSpan(92, 0.5, spans)).toBeCloseTo(260.2, 1);
    expect(pinchedSpan(92, 20, spans)).toBeCloseTo(31 * 0.7);
    expect(pinchedSpan(92, 0.01, spans)).toBe(675);
  });

  it('starts the live window the pinched number of days before the latest date', () => {
    expect(spanStartDate('2026-11-16', 46)).toBe('2026-10-01');
  });
});

describe('useRangePinchZoom', () => {
  it('shows a live window while pinching and snaps to the selected chip on release', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let latest: ReturnType<typeof useRangePinchZoom> & { range: TimeRange };
    function Harness() {
      const [range, setRange] = useState<TimeRange>('3m');
      const zoom = useRangePinchZoom(['2026-11-16', '2025-01-10', '2026-06-01'], range, setRange);
      latest = { ...zoom, range };
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(<Harness />));
    expect(latest!.pinching).toBe(false);
    expect(latest!.pinchStart).toBeUndefined();

    await act(async () => latest!.pinchZoom.onChange(2));
    expect(latest!.range).toBe('1m');
    expect(latest!.pinching).toBe(true);
    expect(latest!.pinchStart).toBe('2026-10-14');

    // Later moves keep measuring from the span the gesture started on.
    await act(async () => latest!.pinchZoom.onChange(0.5));
    expect(latest!.range).toBe('9m');

    await act(async () => latest!.pinchZoom.onEnd());
    expect(latest!.range).toBe('9m');
    expect(latest!.pinching).toBe(false);

    await act(async () => latest!.pinchZoom.onChange(0.5));
    await act(async () => latest!.selectRange('1m'));
    expect(latest!.range).toBe('1m');
    expect(latest!.pinching).toBe(false);
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });
});
