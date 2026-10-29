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

/** Shared month geometry: Monday first, with six week rows for a stable scroll height. */
export function calendarMonths(from: string, count: number, offset = 0) {
  const anchor = parseLocalDate(from);
  return Array.from({ length: count }, (_, index) => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth() + offset + index, 1, 12);
    const dayCount = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
    const leading = (first.getDay() + 6) % 7;
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
