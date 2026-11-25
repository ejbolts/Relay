import { act, renderHook } from '@testing-library/react-native';
import { useState } from 'react';
import type { TimeRange } from '../../../../frontend/src/dateRanges';
import { useRangePinch } from './rangePinch';

test('a pinch keeps the span it started on when the dates change mid-gesture', async () => {
  const { result, rerender } = await renderHook(
    ({ dates }: { dates: string[] }) => {
      const [range, setRange] = useState<TimeRange>('all');
      return { ...useRangePinch(dates, range, setRange), range };
    },
    { initialProps: { dates: ['2023-01-01', '2026-11-16'] } },
  );
  await act(async () => result.current.onPinch(1.2));
  const start = result.current.pinchStart;
  expect(start).toBeDefined();
  // A refresh brings in older history while the fingers are still down.
  await rerender({ dates: ['2020-01-01', '2026-11-16'] });
  await act(async () => result.current.onPinch(1.2));
  expect(result.current.pinchStart).toBe(start);
  await act(async () => result.current.onPinchEnd());
  expect(result.current.pinchStart).toBeUndefined();
});
