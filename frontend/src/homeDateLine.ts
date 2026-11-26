import { parseLocalDate } from './trainingSummary';

/**
 * Home's date line, "Tuesday 24 November". Built from its parts because some platforms' combined
 * format adds a comma after the weekday (Android's gives "Tuesday, 24 November").
 */
export function homeDateLine(isoDate: string, locale = 'en-GB'): string {
  const date = parseLocalDate(isoDate);
  const weekday = date.toLocaleDateString(locale, { weekday: 'long' });
  const month = date.toLocaleDateString(locale, { month: 'long' });
  return `${weekday} ${date.getDate()} ${month}`;
}
