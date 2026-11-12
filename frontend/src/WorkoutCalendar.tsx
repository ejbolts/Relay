import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
import type { DashboardData, WorkoutType, WorkoutTypeColors } from './types';
import { useWorkoutTypes } from './workoutTypesContext';
import { calendarDayTypes } from './workoutTypes';
import { calendarMonths, monthCountFromOldestWorkout } from './calendarRange';
import { Icon } from './Icon';
import {
  addDays,
  isoLocalDate as localCalendarDate,
  parseLocalDate,
  weekStartFor,
} from './trainingSummary';
import { dayFill, readableInk, workoutTypeColor } from './dayColors';
const prettyDateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
function prettyDate(value: string): string {
  return prettyDateFormat.format(new Date(`${value}T12:00:00`));
}
export type OlderHistoryProps = {
  historyStart: string;
  hasOlder: boolean;
  loadingOlder: boolean;
  olderError: string | null;
  onLoadOlder: () => void;
};

/** Scrolling within this many screen widths of the oldest loaded month loads older ones. */
const CALENDAR_LOAD_OLDER_SCREENS = 1.5;

type CalendarPreview = {
  from: string;
  days: Array<{ date: string; label: string; color?: string }>;
};
const EMPTY_ENTRIES: DashboardData['heatmap'] = [];

type WorkoutCalendarProps = {
  /** Workout types switched off in the legend; their colour is left out of the day's fill. */
  hiddenCategories?: ReadonlySet<string>;
  activeWorkoutDate?: string | null;
  onActiveWorkoutClick?: () => void;
  olderHistory?: OlderHistoryProps;
  types?: WorkoutType[];
  readOnly?: boolean;
} & (
  | {
      preview: CalendarPreview;
      entries?: never;
      categoryColors?: never;
      onDayClick?: never;
    }
  | {
      preview?: undefined;
      entries: DashboardData['heatmap'];
      categoryColors: WorkoutTypeColors;
      onDayClick: (
        workoutDate: string,
        entry: DashboardData['heatmap'][number] | undefined,
      ) => void;
    }
);

export function WorkoutCalendar({
  entries = EMPTY_ENTRIES,
  categoryColors,
  hiddenCategories,
  activeWorkoutDate = null,
  onActiveWorkoutClick,
  onDayClick,
  olderHistory,
  types: suppliedTypes,
  readOnly = false,
  preview,
}: WorkoutCalendarProps) {
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const { types: ownTypes } = useWorkoutTypes();
  const types = suppliedTypes ?? ownTypes;
  const historyStart = olderHistory?.historyStart ?? null;
  const hasOlder = olderHistory?.hasOlder ?? false;
  const previewMode = !!preview;
  const previewFrom = preview?.from;
  const previewMap = useMemo(
    () => new Map(preview?.days.map((day) => [day.date, day])),
    [preview?.days],
  );
  const map = useMemo(
    () => new Map(entries.map((entry) => [entry.workout_date, entry])),
    [entries],
  );
  const months = useMemo(() => {
    if (previewFrom) return calendarMonths(previewFrom, 2);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    // Days before the loaded window (from a dashboard cached by an earlier release) are left out,
    // since their workouts are not loaded. While older history remains, the window's first month
    // leads; otherwise the calendar starts at the oldest workout, as before.
    const loadedEntries = historyStart
      ? entries.filter((entry) => entry.workout_date >= historyStart)
      : entries;
    const datedEntries = [
      ...loadedEntries,
      ...(activeWorkoutDate ? [{ workout_date: activeWorkoutDate }] : []),
      ...(hasOlder && historyStart ? [{ workout_date: historyStart }] : []),
    ];
    const allMonthCount = monthCountFromOldestWorkout(datedEntries, today);
    const oldest = new Date(today.getFullYear(), today.getMonth() - allMonthCount + 1, 1, 12);
    return calendarMonths(localCalendarDate(oldest), allMonthCount);
  }, [activeWorkoutDate, entries, hasOlder, historyStart, previewFrom]);
  const todayKey = localCalendarDate(new Date());
  // Taps read the latest handlers from a ref, so the memoised grid below never calls a stale one.
  const handlersRef = useRef({ onDayClick, onActiveWorkoutClick, olderHistory });
  useLayoutEffect(() => {
    handlersRef.current = { onDayClick, onActiveWorkoutClick, olderHistory };
  });

  // The month in view, so prepending older months (or showing a hidden screen again) keeps it in
  // place. `null` follows the newest month; `before` means the loading card ahead of `key`.
  const anchorRef = useRef<{ key: string; before: boolean } | null>(null);
  const restoringScrollRef = useRef(false);
  const restoreScroll = useCallback(() => {
    const calendar = calendarScrollRef.current;
    if (!calendar || calendar.clientWidth === 0) return;
    const anchor = anchorRef.current;
    const month = anchor
      ? calendar.querySelector<HTMLElement>(`[data-month="${anchor.key}"]`)
      : null;
    restoringScrollRef.current = true;
    if (!anchor || !month) {
      calendar.scrollLeft = previewMode ? 0 : calendar.scrollWidth - calendar.clientWidth;
    } else {
      const monthBox = month.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(calendar).columnGap) || 0;
      // From the loading card, land on the newest of the months that just loaded.
      calendar.scrollLeft +=
        monthBox.left -
        calendar.getBoundingClientRect().left -
        (anchor.before ? monthBox.width + gap : 0);
    }
    window.requestAnimationFrame(() => {
      restoringScrollRef.current = false;
    });
  }, [previewMode]);

  useLayoutEffect(restoreScroll, [months, hasOlder, restoreScroll]);

  useEffect(() => {
    const calendar = calendarScrollRef.current;
    if (!calendar || typeof ResizeObserver === 'undefined') return;
    // A hidden screen has no width; once shown again, return to the month that was in view.
    const observer = new ResizeObserver(restoreScroll);
    observer.observe(calendar);
    return () => observer.disconnect();
  }, [restoreScroll]);

  const handleScroll = useCallback(() => {
    const calendar = calendarScrollRef.current;
    if (!calendar || calendar.clientWidth === 0) return;
    if (!restoringScrollRef.current) {
      const left = calendar.getBoundingClientRect().left;
      let closest: { key: string; before: boolean; distance: number } | null = null;
      for (const child of Array.from(calendar.children) as HTMLElement[]) {
        const distance = Math.abs(child.getBoundingClientRect().left - left);
        if (closest && distance >= closest.distance) continue;
        const key =
          child.dataset.month ?? (child.nextElementSibling as HTMLElement | null)?.dataset.month;
        if (key) closest = { key, before: !child.dataset.month, distance };
      }
      const atNewest = calendar.scrollLeft >= calendar.scrollWidth - calendar.clientWidth - 2;
      anchorRef.current =
        closest && (previewMode || !atNewest) ? { key: closest.key, before: closest.before } : null;
    }
    const older = handlersRef.current.olderHistory;
    if (
      older?.hasOlder &&
      !older.loadingOlder &&
      !older.olderError &&
      calendar.scrollLeft < calendar.clientWidth * CALENDAR_LOAD_OLDER_SCREENS
    ) {
      older.onLoadOlder();
    }
  }, [previewMode]);

  // Each tab switch re-renders the cached screens, and redrawing thousands of day cells was most
  // of that cost. The grid now only rebuilds when its data changes.
  const monthGrid = useMemo(
    () =>
      months.map((month) => (
        <article className="calendar-month" key={month.key} data-month={month.key}>
          <h3>{month.title}</h3>
          <div className="calendar-weekdays" aria-hidden="true">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className="calendar-days">
            {/* Every month keeps all six week rows, so months share one height and the ones
                scrolled out of view can skip layout without the calendar changing height. */}
            {Array.from({ length: 6 }, (_, row) => month.cells.slice(row * 7, row * 7 + 7)).map(
              (week, row) => {
                return (
                  <Fragment key={`row-${row}`}>
                    {week.map((day, index) => {
                      if (!day) {
                        return (
                          <span className="calendar-day empty" key={`empty-${row}-${index}`} />
                        );
                      }
                      const key = localCalendarDate(day);
                      const entry = map.get(key);
                      const planned = previewMap.get(key);
                      const inProgress = key === activeWorkoutDate;
                      const dayTypes = entry ? calendarDayTypes(entry, types) : [];
                      const fills = dayTypes
                        .filter((type) => !hiddenCategories?.has(type.id))
                        .map((type) => workoutTypeColor(type, categoryColors));
                      const filteredOut = dayTypes.length > 0 && fills.length === 0;
                      // Back-to-back training days share a band, so a streak reads as one run.
                      const filled = !!entry && !inProgress;
                      const chained = (offset: number) => {
                        const neighbour = addDays(key, offset);
                        return filled && map.has(neighbour) && neighbour !== activeWorkoutDate;
                      };
                      return (
                        <button
                          type="button"
                          className={`calendar-day ${entry ? 'trained' : ''} ${planned ? 'planned' : ''} ${filteredOut ? 'filtered-out' : ''} ${inProgress ? 'in-progress' : ''} ${chained(-1) ? 'chain-prev' : ''} ${chained(1) ? 'chain-next' : ''} ${key === todayKey ? 'today' : ''} ${key > todayKey ? 'future' : ''}`}
                          key={key}
                          data-date={key}
                          style={
                            filled && fills.length
                              ? ({
                                  '--day-fill': dayFill(fills),
                                  '--day-ink': readableInk(fills),
                                } as CSSProperties)
                              : undefined
                          }
                          disabled={previewMode || (readOnly && !entry)}
                          onClick={() => {
                            const handlers = handlersRef.current;
                            if (inProgress && handlers.onActiveWorkoutClick) {
                              handlers.onActiveWorkoutClick();
                            } else handlers.onDayClick?.(key, entry);
                          }}
                          aria-current={key === todayKey ? 'date' : undefined}
                          aria-label={
                            previewMode
                              ? `${prettyDate(key)}: ${planned?.label ?? 'Not started'}`
                              : inProgress
                                ? `Resume workout in progress for ${prettyDate(key)}`
                                : entry
                                  ? `View ${entry.workout_count} ${entry.workout_count === 1 ? 'workout' : 'workouts'} for ${prettyDate(key)}`
                                  : `${readOnly ? 'No workouts' : 'Create workout'} for ${prettyDate(key)}`
                          }
                          title={
                            previewMode
                              ? `${prettyDate(key)}: ${planned?.label ?? 'Not started'}`
                              : inProgress
                                ? `${prettyDate(key)}: workout in progress`
                                : entry
                                  ? `${prettyDate(key)}: ${entry.workout_count} ${entry.workout_count === 1 ? 'workout' : 'workouts'}, ${entry.set_count} sets`
                                  : prettyDate(key)
                          }
                        >
                          <span className="calendar-day-number">{day.getDate()}</span>
                          {/* A completed day is filled with its workout colour, so only planned
                              and in-progress days still carry a dot. */}
                          {(previewMode || inProgress) && (
                            <span className="calendar-day-dots" aria-hidden="true">
                              {planned
                                ? planned.color && <i style={{ backgroundColor: planned.color }} />
                                : inProgress && <i className="calendar-live-dot" />}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </Fragment>
                );
              },
            )}
          </div>
        </article>
      )),
    [
      activeWorkoutDate,
      categoryColors,
      hiddenCategories,
      map,
      months,
      todayKey,
      types,
      readOnly,
      previewMap,
      previewMode,
    ],
  );

  return (
    <div
      className={`calendar-scroll${previewMode ? ' calendar-preview' : ''}`}
      ref={calendarScrollRef}
      onScroll={handleScroll}
    >
      {hasOlder && olderHistory && (
        <div className="calendar-month calendar-month-older" aria-live="polite">
          {olderHistory.olderError ? (
            <>
              <p>Earlier months could not load.</p>
              <button type="button" onClick={olderHistory.onLoadOlder}>
                Try again
              </button>
            </>
          ) : olderHistory.loadingOlder ? (
            <>
              <span className="calendar-older-spinner" aria-hidden="true" />
              <p>Loading earlier months…</p>
            </>
          ) : (
            <button type="button" onClick={olderHistory.onLoadOlder}>
              Load earlier months
            </button>
          )}
        </div>
      )}
      {monthGrid}
    </div>
  );
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** This week's seven days as large tiles, each naming the workout type trained that day. */
export function WeekStrip({
  entries,
  categoryColors,
  hiddenCategories,
  weekStartDay,
  activeWorkoutDate = null,
  onActiveWorkoutClick,
  onDayClick,
  types: suppliedTypes,
}: {
  entries: DashboardData['heatmap'];
  categoryColors: WorkoutTypeColors;
  hiddenCategories?: ReadonlySet<string>;
  /** 0 (Sunday) to 6, matching the week the rest of Home counts. */
  weekStartDay: number;
  activeWorkoutDate?: string | null;
  onActiveWorkoutClick?: () => void;
  onDayClick: (workoutDate: string, entry: DashboardData['heatmap'][number] | undefined) => void;
  types?: WorkoutType[];
}) {
  const { types: ownTypes } = useWorkoutTypes();
  const types = suppliedTypes ?? ownTypes;
  const todayKey = localCalendarDate(new Date());
  const weekStart = weekStartFor(todayKey, weekStartDay);
  const map = useMemo(
    () => new Map(entries.map((entry) => [entry.workout_date, entry])),
    [entries],
  );
  return (
    <div className="week-strip" role="group" aria-label="This week">
      {Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).map((key) => {
        const date = parseLocalDate(key);
        const entry = map.get(key);
        const inProgress = key === activeWorkoutDate;
        const dayTypes = entry ? calendarDayTypes(entry, types) : [];
        const shown = dayTypes.filter((type) => !hiddenCategories?.has(type.id));
        const fills = shown.map((type) => workoutTypeColor(type, categoryColors));
        // A day whose types are all switched off keeps its name, greyed out with the tile.
        const named = shown.length ? shown : dayTypes;
        return (
          <button
            type="button"
            className={`week-strip-day ${entry ? 'trained' : ''} ${fills.length > 1 ? 'mixed' : ''} ${inProgress ? 'in-progress' : ''} ${key === todayKey ? 'today' : ''} ${key > todayKey ? 'future' : ''}`}
            key={key}
            data-date={key}
            style={
              fills.length
                ? ({
                    '--day-color': fills[0],
                    '--day-color-2': fills[1] ?? fills[0],
                  } as CSSProperties)
                : undefined
            }
            onClick={() => {
              if (inProgress && onActiveWorkoutClick) onActiveWorkoutClick();
              else onDayClick(key, entry);
            }}
            aria-current={key === todayKey ? 'date' : undefined}
            aria-label={
              inProgress
                ? `Resume workout in progress for ${prettyDate(key)}`
                : entry
                  ? `View ${entry.workout_count} ${entry.workout_count === 1 ? 'workout' : 'workouts'} for ${prettyDate(key)}`
                  : `Create workout for ${prettyDate(key)}`
            }
          >
            <span className="week-strip-weekday" aria-hidden="true">
              {WEEKDAY_LETTERS[date.getDay()]}
            </span>
            <span className="week-strip-date">{date.getDate()}</span>
            <span className="week-strip-type" aria-hidden="true">
              {inProgress ? (
                <i className="calendar-live-dot" />
              ) : (
                named.length > 0 &&
                // "Upper body" and friends lose the repeated word so the name fits the tile.
                `${named[0].name.replace(/ body$/i, '')}${named.length > 1 ? ` +${named.length - 1}` : ''}`
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function WorkoutCalendarLegend({
  presentTypes,
  hiddenCategories,
  categoryColors,
  onToggle,
}: {
  presentTypes: WorkoutType[];
  hiddenCategories: ReadonlySet<string>;
  categoryColors: WorkoutTypeColors;
  onToggle: (category: string) => void;
}) {
  return (
    <>
      {presentTypes.length > 0 && (
        <ul className="category-legend" aria-label="Workout types">
          {presentTypes.map((type) => {
            const shown = !hiddenCategories.has(type.id);
            return (
              <li key={type.id}>
                <button
                  type="button"
                  className={shown ? '' : 'is-off'}
                  aria-pressed={shown}
                  onClick={() => onToggle(type.id)}
                >
                  <i
                    style={{ background: workoutTypeColor(type, categoryColors) }}
                    aria-hidden="true"
                  />
                  <span className="category-legend-label">{type.name}</span>
                  <span className="category-legend-state" aria-hidden="true">
                    <Icon name="check" />
                    <Icon name="close" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
