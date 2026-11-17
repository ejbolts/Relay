export const TIME_RANGE_OPTIONS = [
  { value: '1m', label: '1 month', months: 1 },
  { value: '3m', label: '3 months', months: 3 },
  { value: '9m', label: '9 months', months: 9 },
  { value: '1y', label: '1 year', months: 12 },
  { value: 'all', label: 'All time', months: null },
] as const;

export type TimeRange = (typeof TIME_RANGE_OPTIONS)[number]['value'];

export interface DateRange {
  start_date?: string;
  end_date?: string;
}

export function dateRangeForDates(dates: string[], range: TimeRange): DateRange {
  const months = TIME_RANGE_OPTIONS.find((option) => option.value === range)!.months;
  if (months === null || dates.length === 0) return {};
  const latestDate = dates.reduce((latest, date) => (date > latest ? date : latest));
  const [year, month, day] = latestDate.split('-').map(Number);
  const targetMonthIndex = year * 12 + month - 1 - months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return {
    start_date: new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)))
      .toISOString()
      .slice(0, 10),
    end_date: latestDate,
  };
}

export function dateRangeQuery(range: DateRange): string {
  const params = new URLSearchParams();
  if (range.start_date) params.set('start_date', range.start_date);
  if (range.end_date) params.set('end_date', range.end_date);
  return params.size ? `?${params}` : '';
}
