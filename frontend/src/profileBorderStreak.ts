import { dayMonth, parseLocalDate } from './trainingSummary';
import type { BorderStreak } from './types';

const UNITS: Record<string, [one: string, many: string]> = {
  days: ['day', 'days'],
  Mondays: ['Monday', 'Mondays'],
  weeks: ['week', 'weeks'],
};

/** "1 day", "8 Mondays", "12 weeks"; a unit the app doesn't know yet is shown as sent. */
export function streakLength(count: number, unit: string): string {
  const [one, many] = UNITS[unit] ?? [unit, unit];
  return `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`;
}

/** "22 Nov", with the year when it isn't this one: "22 Nov 2025". */
export function streakDate(value: string, today: Date = new Date()): string {
  const year = parseLocalDate(value).getFullYear();
  return year === today.getFullYear() ? dayMonth(value) : `${dayMonth(value)} ${year}`;
}

/** "10–21 Nov", "28 Oct – 3 Nov", "21 Nov", or across years "29 Dec 2025 – 4 Jan 2026". */
export function streakSpan(
  start: string | null | undefined,
  end: string | null | undefined,
  today: Date = new Date(),
): string | null {
  const first = start ?? end;
  const last = end ?? start;
  if (!first || !last) return null;
  if (first === last) return streakDate(first, today);
  const from = parseLocalDate(first);
  const to = parseLocalDate(last);
  if (from.getFullYear() !== to.getFullYear()) {
    return `${dayMonth(first)} ${from.getFullYear()} – ${dayMonth(last)} ${to.getFullYear()}`;
  }
  if (from.getMonth() === to.getMonth()) return `${from.getDate()}–${streakDate(last, today)}`;
  return `${dayMonth(first)} – ${streakDate(last, today)}`;
}

/** "Current", "12 days", "10–21 Nov"; dates are kept apart so they never wrap mid-date. */
export interface StreakLine {
  label: 'Current' | 'Best' | 'Streak ended';
  length: string | null;
  dates: string | null;
}

/**
 * The lines under a streak border's progress: the run going now ("Current 12 days · 10–21 Nov")
 * or when the latest one ended, then the longest run unless it is the one going now.
 */
export function streakLines(streak: BorderStreak, today: Date = new Date()): StreakLine[] {
  const lines: StreakLine[] = [];
  const going = streak.active && streak.current > 0;
  if (going) {
    lines.push({
      label: 'Current',
      length: streakLength(streak.current, streak.unit),
      dates: streakSpan(streak.current_start, streak.current_end, today),
    });
  } else if (streak.broken_on || streak.current > 0) {
    lines.push({
      label: 'Streak ended',
      length: null,
      dates: streak.broken_on ? streakDate(streak.broken_on, today) : null,
    });
  }
  const bestIsCurrent =
    going &&
    streak.best === streak.current &&
    (streak.best_start ?? null) === (streak.current_start ?? null);
  if (streak.best > 0 && !bestIsCurrent) {
    lines.push({
      label: 'Best',
      length: streakLength(streak.best, streak.unit),
      dates: streakSpan(streak.best_start, streak.best_end, today),
    });
  }
  return lines;
}
