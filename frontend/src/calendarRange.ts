import { isoLocalDate, parseLocalDate } from './trainingSummary';

export interface DatedWorkoutEntry {
  workout_date: string;
}

export function monthCountFromOldestWorkout(
  entries: DatedWorkoutEntry[],
  today = new Date(),
): number {
  if (!entries.length) return 1;
  const oldest = entries.reduce(
    (date, entry) => (entry.workout_date < date ? entry.workout_date : date),
    entries[0].workout_date,
  );
  const [year, month] = oldest.split('-').map(Number);
  const count = (today.getFullYear() - year) * 12 + today.getMonth() - (month - 1) + 1;
  return Math.max(count, 1);
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function calendarWeekdays(weekStartDay = 1): string[] {
  return Array.from({ length: 7 }, (_, index) => WEEKDAY_INITIALS[(weekStartDay + index) % 7]);
}

/** Shared month geometry with six week rows and Monday first until preferences load. */
export function calendarMonths(from: string, count: number, offset = 0, weekStartDay = 1) {
  const anchor = parseLocalDate(from);
  return Array.from({ length: count }, (_, index) => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth() + offset + index, 1, 12);
    const dayCount = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
    const leading = (first.getDay() - weekStartDay + 7) % 7;
    const cells: Array<Date | null> = [
      ...Array.from({ length: leading }, () => null),
      ...Array.from(
        { length: dayCount },
        (_, day) => new Date(first.getFullYear(), first.getMonth(), day + 1, 12),
      ),
    ];
    while (cells.length < 42) cells.push(null);
    return {
      first: isoLocalDate(first),
      key: `${first.getFullYear()}-${first.getMonth()}`,
      title: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      cells,
    };
  });
}
