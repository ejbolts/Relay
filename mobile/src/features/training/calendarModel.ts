import {
  calendarMonths,
  calendarWeekdays,
  entriesInMonths,
} from '../../../../frontend/src/calendarRange';
import { calendarDayLook } from '../../../../frontend/src/calendarDayLook';
import { RING_GAP_DEG, workoutTypeColor } from '../../../../frontend/src/dayColors';
import { isoLocalDate } from '../../../../frontend/src/trainingSummary';
import type { HeatmapDay, WorkoutType, WorkoutTypeColors } from '../../../../frontend/src/types';
import { calendarLegendTypes } from '../../../../frontend/src/workoutTypes';

/** A calendar month as `YYYY-MM`. */
export type MonthKey = string;

export const monthOf = (date: string): MonthKey => date.slice(0, 7);

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, index] = month.split('-').map(Number);
  const shifted = new Date(year, index - 1 + delta, 1, 12);
  return isoLocalDate(shifted).slice(0, 7);
}

/**
 * The page a horizontal pager settled on, from its scroll event. In a right-to-left layout the
 * first page sits at the right, so the offset is measured from there, as React Native's own
 * lists do.
 */
export function settledPage(
  {
    contentOffset,
    contentSize,
    layoutMeasurement,
  }: {
    contentOffset: { x: number };
    contentSize: { width: number };
    layoutMeasurement: { width: number };
  },
  rtl: boolean,
  count: number,
): number {
  const width = layoutMeasurement.width;
  if (width <= 0 || count <= 0) return 0;
  const offset = rtl ? contentSize.width - (contentOffset.x + width) : contentOffset.x;
  return Math.max(0, Math.min(count - 1, Math.round(offset / width)));
}

/** History grouped by month once, so each month's page reads only its own days. */
export function entriesByMonth(
  entries: readonly HeatmapDay[],
): ReadonlyMap<MonthKey, HeatmapDay[]> {
  const months = new Map<MonthKey, HeatmapDay[]>();
  for (const entry of entries) {
    const key = monthOf(entry.workout_date);
    const list = months.get(key);
    if (list) list.push(entry);
    else months.set(key, [entry]);
  }
  return months;
}

/**
 * Month views built at most once each for one set of inputs: the pager's pages and the legend
 * share the month on show.
 */
export function monthViews(
  options: Omit<Parameters<typeof calendarMonthView>[0], 'month' | 'entries'> & {
    byMonth: ReadonlyMap<MonthKey, HeatmapDay[]>;
  },
): (month: MonthKey) => CalendarMonthView {
  const { byMonth, ...rest } = options;
  const views = new Map<MonthKey, CalendarMonthView>();
  return (month) => {
    let view = views.get(month);
    if (!view) {
      view = calendarMonthView({ ...rest, month, entries: byMonth.get(month) ?? [] });
      views.set(month, view);
    }
    return view;
  };
}

/** Every month from `first` to `last`, oldest first: the pages of the calendar's month pager. */
export function monthsBetween(first: MonthKey, last: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  for (let month = first; month <= last; month = shiftMonth(month, 1)) months.push(month);
  return months;
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
  /** The split's types planned on a day ahead, or missed on a past one: several on a mixed day. */
  scheduled: string[];
  /** "Upper body + Cardio planned" or "… missed", for the day's label. */
  scheduledNote: string | null;
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

/**
 * One month of the calendar, each day ringed by the colours of the workouts it holds, and the
 * split's planned or missed days outlined in their types' colours, as the web's calendar does.
 */
export function calendarMonthView({
  month,
  entries,
  types,
  categoryColors,
  hidden,
  weekStartDay,
  today,
  splitDays,
}: {
  month: MonthKey;
  entries: HeatmapDay[];
  types: WorkoutType[];
  categoryColors: WorkoutTypeColors;
  hidden: ReadonlySet<string>;
  weekStartDay: number;
  today: string;
  /** The types a split plans on each date (trainingSplit's `splitCalendarDays`). */
  splitDays?: ReadonlyMap<string, readonly string[]>;
}): CalendarMonthView {
  const [geometry] = calendarMonths(`${month}-01`, 1, 0, weekStartDay);
  const byDate = new Map(entries.map((entry) => [entry.workout_date, entry]));
  const cells = geometry.cells.map((cell): CalendarDay | null => {
    if (!cell) return null;
    const date = isoLocalDate(cell);
    const entry = byDate.get(date);
    const look = calendarDayLook({
      date,
      today,
      entry,
      types,
      categoryColors,
      hiddenCategories: hidden,
      splitDays,
    });
    return {
      date,
      day: cell.getDate(),
      entry,
      ring: look.ring,
      dots: look.dayTypes.map((type) =>
        hidden.has(type.id) ? null : workoutTypeColor(type, categoryColors),
      ),
      filteredOut: look.filteredOut,
      scheduled: look.scheduledRing,
      scheduledNote: look.scheduledNote,
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
