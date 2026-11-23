import {
  calendarMonths,
  calendarWeekdays,
  entriesInMonths,
} from '../../../../frontend/src/calendarRange';
import { RING_GAP_DEG, workoutTypeColor } from '../../../../frontend/src/dayColors';
import { isoLocalDate } from '../../../../frontend/src/trainingSummary';
import type { HeatmapDay, WorkoutType, WorkoutTypeColors } from '../../../../frontend/src/types';
import { calendarDayTypes, calendarLegendTypes } from '../../../../frontend/src/workoutTypes';

/** A calendar month as `YYYY-MM`. */
export type MonthKey = string;

export const monthOf = (date: string): MonthKey => date.slice(0, 7);

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, index] = month.split('-').map(Number);
  const shifted = new Date(year, index - 1 + delta, 1, 12);
  return isoLocalDate(shifted).slice(0, 7);
}

/**
 * The months the calendar pages through: from the oldest workout the account has (or the oldest
 * day loaded) up to the current month, as the web's calendar scrolls.
 */
export function calendarBounds(
  today: string,
  dates: readonly (string | null | undefined)[],
): { first: MonthKey; last: MonthKey } {
  const last = monthOf(today);
  const oldest = dates
    .filter((date): date is string => Boolean(date))
    .reduce<string | null>((min, date) => (min === null || date < min ? date : min), null);
  return {
    first: oldest && monthOf(oldest) < last ? monthOf(oldest) : last,
    last,
  };
}

export interface CalendarDay {
  date: string;
  day: number;
  entry: HeatmapDay | undefined;
  /** The colours of the day's types still switched on in the legend, for its ring. */
  ring: string[];
  /** One dot per type trained that day; null when the legend switched it off. */
  dots: (string | null)[];
  /** Trained, but every type it holds is switched off in the legend. */
  filteredOut: boolean;
  today: boolean;
  future: boolean;
}

export interface CalendarMonthView {
  month: MonthKey;
  title: string;
  weekdays: string[];
  /** Always six weeks, so paging between months never changes the calendar's height. */
  weeks: (CalendarDay | null)[][];
  /** The types trained this month, for the legend. */
  legend: WorkoutType[];
}

/** One month of the calendar, each day ringed by the colours of the workouts it holds. */
export function calendarMonthView({
  month,
  entries,
  types,
  categoryColors,
  hidden,
  weekStartDay,
  today,
}: {
  month: MonthKey;
  entries: HeatmapDay[];
  types: WorkoutType[];
  categoryColors: WorkoutTypeColors;
  hidden: ReadonlySet<string>;
  weekStartDay: number;
  today: string;
}): CalendarMonthView {
  const [geometry] = calendarMonths(`${month}-01`, 1, 0, weekStartDay);
  const byDate = new Map(entries.map((entry) => [entry.workout_date, entry]));
  const cells = geometry.cells.map((cell): CalendarDay | null => {
    if (!cell) return null;
    const date = isoLocalDate(cell);
    const entry = byDate.get(date);
    const dayTypes = entry ? calendarDayTypes(entry, types) : [];
    const ring = dayTypes
      .filter((type) => !hidden.has(type.id))
      .map((type) => workoutTypeColor(type, categoryColors));
    return {
      date,
      day: cell.getDate(),
      entry,
      ring,
      dots: dayTypes.map((type) =>
        hidden.has(type.id) ? null : workoutTypeColor(type, categoryColors),
      ),
      filteredOut: dayTypes.length > 0 && ring.length === 0,
      today: date === today,
      future: date > today,
    };
  });
  return {
    month,
    title: geometry.title,
    weekdays: calendarWeekdays(weekStartDay),
    weeks: Array.from({ length: 6 }, (_, row) => cells.slice(row * 7, row * 7 + 7)),
    legend: calendarLegendTypes(entriesInMonths(entries, [month]), types),
  };
}

/** The share of a rounded square's outline each colour of a mixed day takes, with gaps. */
export function ringSegments(colors: string[], perimeter: number) {
  if (colors.length <= 1) return colors.map((color) => ({ color, length: perimeter, offset: 0 }));
  const step = perimeter / colors.length;
  const gap = (RING_GAP_DEG / 360) * perimeter;
  return colors.map((color, index) => ({
    color,
    length: step - gap,
    offset: index * step + gap / 2,
  }));
}
