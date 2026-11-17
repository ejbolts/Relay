import { describe, expect, it } from 'vitest';
import {
  BODY_TREND_DURATION_OPTIONS,
  bodyTrendCutoffDate,
  bodyTrendRangeSpans,
  bodyTrendSpanStart,
  clipBodyWeightGoalPath,
  filterMeasurementsByRange,
  nearestBodyTrendRange,
  nearestChartPointIndex,
  pinchedBodyTrendSpan,
  summarizeBodyWeightTrend,
} from './bodyTrend';

describe('body-composition chart ranges and scrubbing', () => {
  const measurements = [
    { measurement_date: '2025-07-31', weight_kg: 90 },
    { measurement_date: '2025-10-30', weight_kg: 89 },
    { measurement_date: '2025-10-31', weight_kg: 88 },
    { measurement_date: '2026-04-29', weight_kg: 87 },
    { measurement_date: '2026-04-30', weight_kg: 86 },
    { measurement_date: '2026-07-31', weight_kg: 85 },
  ];

  it('filters calendar ranges relative to the latest measurement', () => {
    expect(
      filterMeasurementsByRange(
        [
          { measurement_date: '2026-06-29' },
          { measurement_date: '2026-06-30' },
          { measurement_date: '2026-07-31' },
        ],
        '1m',
      ).map((item) => item.measurement_date),
    ).toEqual(['2026-06-30', '2026-07-31']);
    expect(
      filterMeasurementsByRange(measurements, '3m').map((item) => item.measurement_date),
    ).toEqual(['2026-04-30', '2026-07-31']);
    expect(
      filterMeasurementsByRange(measurements, '9m').map((item) => item.measurement_date),
    ).toEqual(['2025-10-31', '2026-04-29', '2026-04-30', '2026-07-31']);
    expect(filterMeasurementsByRange(measurements, '1y')).toEqual(measurements);
    expect(filterMeasurementsByRange(measurements, 'all')).toEqual(measurements);
  });

  it('selects and clamps the nearest point while scrubbing', () => {
    expect(nearestChartPointIndex(42, 42, 302, 4)).toBe(0);
    expect(nearestChartPointIndex(175, 42, 302, 4)).toBe(2);
    expect(nearestChartPointIndex(999, 42, 302, 4)).toBe(3);
  });

  it('clips a goal path to the selected chart window', () => {
    const clipped = clipBodyWeightGoalPath(
      {
        start_date: '2026-07-31',
        target_date: '2026-09-25',
        start_weight_kg: 87,
        target_weight_kg: 82,
      },
      '2026-08-23',
      '2026-09-23',
    );

    expect(clipped?.start_date).toBe('2026-08-23');
    expect(clipped?.target_date).toBe('2026-09-23');
    expect(clipped?.start_weight_kg).toBeCloseTo(84.946, 3);
    expect(clipped?.target_weight_kg).toBeCloseTo(82.179, 3);
  });

  it('omits goal paths that do not overlap the selected chart window', () => {
    expect(
      clipBodyWeightGoalPath(
        {
          start_date: '2026-07-01',
          target_date: '2026-07-31',
          start_weight_kg: 87,
          target_weight_kg: 85,
        },
        '2026-08-23',
        '2026-09-23',
      ),
    ).toBeNull();
  });
});

describe('bodyweight trend summary', () => {
  it('offers every requested duration', () => {
    expect(BODY_TREND_DURATION_OPTIONS.map((option) => option.value)).toEqual([
      '7d',
      '14d',
      '30d',
      '60d',
      '90d',
      '6m',
      '1y',
    ]);
  });

  it('calculates average and median inside an inclusive day window', () => {
    const summary = summarizeBodyWeightTrend(
      [
        { measurement_date: '2026-08-26', weight_kg: 60 },
        { measurement_date: '2026-08-27', weight_kg: 80 },
        { measurement_date: '2026-08-30', weight_kg: 90 },
        { measurement_date: '2026-09-02', weight_kg: 100 },
      ],
      '7d',
    );

    expect(summary).toEqual({ average: 90, median: 90, count: 3 });
  });

  it('uses calendar months and clamps month-end dates', () => {
    expect(bodyTrendCutoffDate('2026-08-31', '6m')).toBe('2026-02-28');
    expect(bodyTrendCutoffDate('2024-08-31', '6m')).toBe('2024-02-29');
    expect(bodyTrendCutoffDate('2026-09-02', '1y')).toBe('2025-09-02');
  });
});

describe('pinch zooming the body trend', () => {
  const dates = ['2025-01-10', '2026-05-15', '2026-11-16'];
  const spans = bodyTrendRangeSpans(dates);

  it('measures each chip back from the latest check-in', () => {
    expect(spans['1m']).toBe(31);
    expect(spans['3m']).toBe(92);
    expect(spans['1y']).toBe(365);
    expect(spans.all).toBe(675);
  });

  it('gives "All" room beyond a year when the history is short', () => {
    expect(bodyTrendRangeSpans(['2026-11-13', '2026-11-16']).all).toBe(365 * 1.5);
  });

  it('highlights the chip nearest the pinched span', () => {
    expect(nearestBodyTrendRange(25, spans)).toBe('1m');
    expect(nearestBodyTrendRange(60, spans)).toBe('3m');
    expect(nearestBodyTrendRange(200, spans)).toBe('9m');
    expect(nearestBodyTrendRange(330, spans)).toBe('1y');
    expect(nearestBodyTrendRange(600, spans)).toBe('all');
  });

  it('zooms in when the fingers spread and out when they close', () => {
    expect(pinchedBodyTrendSpan(92, 2, spans)).toBeCloseTo(32.5, 1);
    expect(pinchedBodyTrendSpan(92, 0.5, spans)).toBeCloseTo(260.2, 1);
    expect(pinchedBodyTrendSpan(92, 20, spans)).toBeCloseTo(31 * 0.7);
    expect(pinchedBodyTrendSpan(92, 0.01, spans)).toBe(675);
  });

  it('starts the live window the pinched number of days before the latest check-in', () => {
    expect(bodyTrendSpanStart(dates, 46)).toBe('2026-10-01');
    expect(bodyTrendSpanStart([], 46)).toBeUndefined();
  });
});
