import { parseLocalDate } from '../../../../frontend/src/trainingSummary';

const format = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Nov 21, 2026", as the web's calendar names a day. */
export const prettyDate = (value: string) => format.format(parseLocalDate(value));
