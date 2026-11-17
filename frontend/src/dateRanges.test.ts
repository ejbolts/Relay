import { describe, expect, it } from 'vitest';
import { filterMeasurementsByRange } from './bodyTrend';
import { dateRangeForDates, dateRangeQuery, TIME_RANGE_OPTIONS } from './dateRanges';

describe('shared graph and export time frames', () => {
  it.each([
    ['1m', '2026-07-28'],
    ['3m', '2026-05-28'],
    ['9m', '2025-11-28'],
    ['1y', '2025-08-28'],
  ] as const)('anchors %s to the latest saved date, regardless of input order', (range, start) => {
    expect(dateRangeForDates(['2026-08-01', '2026-08-28', '2024-01-01'], range)).toEqual({
      start_date: start,
      end_date: '2026-08-28',
    });
  });

  it('clamps month and leap-year boundaries to valid dates', () => {
    expect(dateRangeForDates(['2026-03-31'], '1m').start_date).toBe('2026-02-28');
    expect(dateRangeForDates(['2024-03-31'], '1m').start_date).toBe('2024-02-29');
    expect(dateRangeForDates(['2024-02-29'], '1y').start_date).toBe('2023-02-28');
  });

  it('uses the same inclusive dates as the graph for every option', () => {
    const dates = ['2025-08-27', '2025-08-28', '2025-11-28', '2026-05-28', '2026-08-28'];
    const measurements = dates.map((measurement_date) => ({ measurement_date }));
    for (const option of TIME_RANGE_OPTIONS) {
      const bounds = dateRangeForDates(dates, option.value);
      expect(filterMeasurementsByRange(measurements, option.value)).toEqual(
        measurements.filter(
          (item) =>
            (!bounds.start_date || item.measurement_date >= bounds.start_date) &&
            (!bounds.end_date || item.measurement_date <= bounds.end_date),
        ),
      );
    }
  });

  it('keeps all-time and empty exports unfiltered', () => {
    expect(dateRangeForDates(['2020-01-01', '2026-08-28'], 'all')).toEqual({});
    for (const option of TIME_RANGE_OPTIONS) {
      expect(dateRangeForDates([], option.value)).toEqual({});
    }
    expect(dateRangeQuery({})).toBe('');
  });

  it('passes the selected date boundaries to export requests', () => {
    expect(dateRangeQuery(dateRangeForDates(['2026-08-28'], '3m'))).toBe(
      '?start_date=2026-05-28&end_date=2026-08-28',
    );
  });
});
