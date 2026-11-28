import { describe, expect, it } from 'vitest';
import {
  chartYearChange,
  chartYearLabel,
  chartYears,
  chartYearSummary,
  crossesNewYear,
  parseChartYearLines,
  serializeChartYearLines,
} from './chartYears';
import { parseLocalDate } from './trainingSummary';

const time = (date: string) => parseLocalDate(date).getTime();

describe('chartYears', () => {
  it('splits a chart into its calendar years, clipping the first and last to the chart', () => {
    const years = chartYears(time('2023-09-15'), time('2025-03-01'));
    expect(years.map((item) => item.year)).toEqual([2023, 2024, 2025]);
    expect(years[0].start).toBe(time('2023-09-15'));
    expect(years[0].end).toBe(new Date(2024, 0, 1).getTime());
    expect(years[1]).toEqual({
      year: 2024,
      start: new Date(2024, 0, 1).getTime(),
      end: new Date(2025, 0, 1).getTime(),
    });
    expect(years[2].end).toBe(time('2025-03-01'));
  });

  it('has no years to mark inside a single year', () => {
    expect(chartYears(time('2025-01-01'), time('2025-12-31'))).toEqual([]);
  });

  it('marks a boundary even when the chart only just crosses it', () => {
    expect(chartYears(time('2025-12-20'), time('2026-01-03')).map((item) => item.year)).toEqual([
      2025, 2026,
    ]);
  });
});

describe('crossesNewYear', () => {
  it('needs dates from two calendar years', () => {
    expect(crossesNewYear(['2025-02-01', '2025-11-30'])).toBe(false);
    expect(crossesNewYear(['2025-12-31', '2026-01-01'])).toBe(true);
    expect(crossesNewYear(['2026-05-01', '2024-03-01', '2026-01-01'])).toBe(true);
    expect(crossesNewYear([])).toBe(false);
  });
});

describe('chartYearLabel', () => {
  it('shortens and then drops the label as the year gets narrower', () => {
    expect(chartYearLabel(2025, 120)).toBe('2025');
    expect(chartYearLabel(2025, 46)).toBe('2025');
    expect(chartYearLabel(2025, 40)).toBe('’25');
    expect(chartYearLabel(2025, 29)).toBeNull();
  });
});

describe('chartYearChange and chartYearSummary', () => {
  const points = [
    { date: '2024-12-28', value: 92.4 },
    { date: '2025-01-04', value: 92 },
    { date: '2025-06-01', value: 86.5 },
    { date: '2025-12-30', value: 84.1 },
    { date: '2026-01-02', value: 84.3 },
  ];
  const format = (value: number) => value.toFixed(1);

  it('takes the first and last value inside the year', () => {
    expect(chartYearChange(points, 2025)).toEqual({
      year: 2025,
      first: 92,
      last: 84.1,
      change: 84.1 - 92,
    });
    expect(chartYearChange(points, 2023)).toBeNull();
  });

  it('writes the year, its start and end, and the signed change', () => {
    expect(chartYearSummary(chartYearChange(points, 2025)!, format, 'kg')).toBe(
      '2025 · 92.0 → 84.1 kg · −7.9 kg',
    );
    expect(chartYearSummary({ year: 2024, first: 80, last: 82.5, change: 2.5 }, format, 'lb')).toBe(
      '2024 · 80.0 → 82.5 lb · +2.5 lb',
    );
    expect(chartYearSummary({ year: 2024, first: 18, last: 16.5, change: -1.5 }, format, '%')).toBe(
      '2024 · 18.0 → 16.5% · −1.5%',
    );
  });

  it('gives a change that rounds to nothing no sign', () => {
    expect(
      chartYearSummary({ year: 2025, first: 80, last: 80.02, change: 0.02 }, format, 'kg'),
    ).toBe('2025 · 80.0 → 80.0 kg · 0.0 kg');
  });
});

describe('the saved choice', () => {
  it('is off until turned on', () => {
    expect(parseChartYearLines(null)).toBe(false);
    expect(parseChartYearLines('nonsense')).toBe(false);
    expect(parseChartYearLines(serializeChartYearLines(true))).toBe(true);
    expect(parseChartYearLines(serializeChartYearLines(false))).toBe(false);
  });
});
