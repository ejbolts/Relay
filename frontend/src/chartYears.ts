import { parseLocalDate } from './trainingSummary';

/**
 * Year lines on long charts: a dotted line at each 1 January and a pill naming each year, which
 * can be tapped to see where that year started and ended. Shared by the web and the app.
 */

/** Where the choice to show year lines is kept on the device. */
export const CHART_YEAR_LINES_KEY = 'relay-chart-year-lines';

export function parseChartYearLines(saved: string | null): boolean {
  return saved === 'on';
}

export function serializeChartYearLines(on: boolean): string {
  return on ? 'on' : 'off';
}

/** One calendar year's slice of a chart's time axis, in milliseconds, clipped to the chart. */
export interface ChartYear {
  year: number;
  start: number;
  end: number;
}

/**
 * The calendar years a chart from `tMin` to `tMax` covers, oldest first, each clipped to the
 * chart. Empty when the chart stays inside one year, as there is no boundary to mark.
 */
export function chartYears(tMin: number, tMax: number): ChartYear[] {
  const first = new Date(tMin).getFullYear();
  const last = new Date(tMax).getFullYear();
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return [];
  const years: ChartYear[] = [];
  for (let year = first; year <= last; year += 1) {
    years.push({
      year,
      start: Math.max(tMin, new Date(year, 0, 1).getTime()),
      end: Math.min(tMax, new Date(year + 1, 0, 1).getTime()),
    });
  }
  return years;
}

/** Whether the dates cross at least one 1 January, so year lines have something to show. */
export function crossesNewYear(dates: Iterable<string>): boolean {
  let first: number | null = null;
  for (const date of dates) {
    const year = parseLocalDate(date).getFullYear();
    if (!Number.isFinite(year)) continue;
    if (first === null) first = year;
    else if (year !== first) return true;
  }
  return false;
}

/** The narrowest year slice, in pixels, that still gets a pill, and the one that fits "2025". */
const SHORT_LABEL_WIDTH = 30;
const FULL_LABEL_WIDTH = 46;

/** A year's pill label for a slice `width` pixels wide: "2025", "’25", or null when too narrow. */
export function chartYearLabel(year: number, width: number): string | null {
  if (width >= FULL_LABEL_WIDTH) return String(year);
  if (width >= SHORT_LABEL_WIDTH) return `’${String(year).slice(2)}`;
  return null;
}

export interface ChartYearChange {
  year: number;
  first: number;
  last: number;
  change: number;
}

/** A year's first and last value on the chart; null when the chart has no value in that year. */
export function chartYearChange(
  points: ReadonlyArray<{ date: string; value: number }>,
  year: number,
): ChartYearChange | null {
  const inYear = points
    .filter((point) => parseLocalDate(point.date).getFullYear() === year)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (!inYear.length) return null;
  const first = inYear[0].value;
  const last = inYear[inYear.length - 1].value;
  return { year, first, last, change: last - first };
}

/** "2025 · 92.0 → 84.1 kg · −7.9 kg", with values written by the chart's own formatter. */
export function chartYearSummary(
  change: ChartYearChange,
  format: (value: number) => string,
  unit: string,
): string {
  const suffix = unit === '%' ? '%' : unit ? ` ${unit}` : '';
  // Round before choosing the sign, so a change that rounds to nothing reads as "0", not "−0".
  const rounded = Number(format(Math.abs(change.change)).replace(/[^\d.]/g, ''));
  const sign = rounded === 0 ? '' : change.change > 0 ? '+' : '−';
  return `${change.year} · ${format(change.first)} → ${format(change.last)}${suffix} · ${sign}${format(Math.abs(change.change))}${suffix}`;
}
