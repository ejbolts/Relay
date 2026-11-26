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
import { calendarDayLook, todayOutlineColors, weekStripLabels } from './calendarDayLook';
import { calendarMonths, calendarWeekdays, monthCountFromOldestWorkout } from './calendarRange';
import { useWeekStartDay } from './trainingPreferencesContext';
import { Icon } from './Icon';
import {
  addDays,
  isoLocalDate as localCalendarDate,
  parseLocalDate,
  weekStartFor,
} from './trainingSummary';
import { dayRing, workoutTypeColor } from './dayColors';
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
  /** Each planned day's label and the colours of its workout types, several on a mixed day. */
  days: Array<{ date: string; label: string; colors?: string[] }>;
};
const EMPTY_ENTRIES: DashboardData['heatmap'] = [];

type WorkoutCalendarProps = {
  /** Workout types switched off in the legend; their dots and day borders are greyed out. */
  hiddenCategories?: ReadonlySet<string>;
  activeWorkoutDate?: string | null;
  /** The colour of the workout type being logged, for the live day's outline and ripple. */
  activeWorkoutColor?: string | null;
  selectedDate?: string | null;
  onActiveWorkoutClick?: () => void;
  olderHistory?: OlderHistoryProps;
  types?: WorkoutType[];
  readOnly?: boolean;
  /** Called with the `YYYY-MM` months on screen whenever they change, for the legend. */
  onVisibleMonthsChange?: (months: string[]) => void;
  /** The workout type a split plans on a date: days ahead, and past days it was missed. */
  splitDays?: ReadonlyMap<string, readonly string[]>;
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
  activeWorkoutColor = null,
  selectedDate = null,
  onActiveWorkoutClick,
  onDayClick,
  olderHistory,
  types: suppliedTypes,
  readOnly = false,
  onVisibleMonthsChange,
  splitDays,
  preview,
}: WorkoutCalendarProps) {
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const weekStartDay = useWeekStartDay();
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
    if (previewFrom) return calendarMonths(previewFrom, 2, 0, weekStartDay);
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
    return calendarMonths(localCalendarDate(oldest), allMonthCount, 0, weekStartDay);
  }, [activeWorkoutDate, entries, hasOlder, historyStart, previewFrom, weekStartDay]);
  const todayKey = localCalendarDate(new Date());
  // Taps read the latest handlers from a ref, so the memoised grid below never calls a stale one.
  const handlersRef = useRef({
    onDayClick,
    onActiveWorkoutClick,
    olderHistory,
    onVisibleMonthsChange,
  });
  useLayoutEffect(() => {
    handlersRef.current = { onDayClick, onActiveWorkoutClick, olderHistory, onVisibleMonthsChange };
  });

  // Months at least half on screen count as visible; mid-swipe, when none is, the one showing most.
  const visibleMonthsRef = useRef<string | null>(null);
  const reportVisibleMonths = useCallback(() => {
    const calendar = calendarScrollRef.current;
    const report = handlersRef.current.onVisibleMonthsChange;
    if (!calendar || !report || calendar.clientWidth === 0) return;
    const view = calendar.getBoundingClientRect();
    const visible: string[] = [];
    let most: { month: string; shown: number } | null = null;
    for (const element of calendar.querySelectorAll<HTMLElement>('[data-month-start]')) {
      const box = element.getBoundingClientRect();
      if (box.left >= view.right) break;
      const shown = Math.min(box.right, view.right) - Math.max(box.left, view.left);
      if (shown <= 0) continue;
      const month = element.dataset.monthStart!;
      if (shown >= box.width / 2) visible.push(month);
      if (!most || shown > most.shown) most = { month, shown };
    }
    if (!visible.length && most) visible.push(most.month);
    const signature = visible.join();
    if (signature === visibleMonthsRef.current) return;
    visibleMonthsRef.current = signature;
    report(visible);
  }, []);

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

  useLayoutEffect(() => {
    restoreScroll();
    reportVisibleMonths();
  }, [months, hasOlder, restoreScroll, reportVisibleMonths]);

  useEffect(() => {
    const calendar = calendarScrollRef.current;
    if (!calendar || typeof ResizeObserver === 'undefined') return;
    // A hidden screen has no width; once shown again, return to the month that was in view.
    const observer = new ResizeObserver(() => {
      restoreScroll();
      reportVisibleMonths();
    });
    observer.observe(calendar);
    return () => observer.disconnect();
  }, [restoreScroll, reportVisibleMonths]);

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
    reportVisibleMonths();
    const older = handlersRef.current.olderHistory;
    if (
      older?.hasOlder &&
      !older.loadingOlder &&
      !older.olderError &&
      calendar.scrollLeft < calendar.clientWidth * CALENDAR_LOAD_OLDER_SCREENS
    ) {
      older.onLoadOlder();
    }
  }, [previewMode, reportVisibleMonths]);

  // Each tab switch re-renders the cached screens, and redrawing thousands of day cells was most
  // of that cost. The grid now only rebuilds when its data changes.
  const monthGrid = useMemo(
    () =>
      months.map((month) => (
        <article
          className="calendar-month"
          key={month.key}
          data-month={month.key}
          data-month-start={month.first.slice(0, 7)}
        >
          <h3>{month.title}</h3>
          <div className="calendar-weekdays" aria-hidden="true">
            {calendarWeekdays(weekStartDay).map((day, index) => (
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
                      // The border takes the colours of the types still switched on in the
                      // legend; a day with nothing logged keeps a faint outline for the split's.
                      const { dayTypes, ring, filteredOut, scheduledRing, scheduledNote } =
                        calendarDayLook({
                          date: key,
                          today: todayKey,
                          entry,
                          inProgress,
                          types,
                          categoryColors,
                          hiddenCategories,
                          splitDays: previewMode ? undefined : splitDays,
                        });
                      const dayRingStyle =
                        ring.length && !inProgress ? dayRing(ring) : dayRing(scheduledRing);
                      // Today's outer ring and ripple take its workout colours, split into arcs on
                      // a mixed day: the types logged, or the split's plan before anything starts.
                      // A live workout keeps the flat outline in the colour being logged.
                      const todayColors =
                        key === todayKey && !inProgress
                          ? todayOutlineColors({ ring, scheduledRing })
                          : [];
                      const todayRing = todayColors.length > 0;
                      return (
                        <button
                          type="button"
                          className={`calendar-day ${entry ? 'trained' : ''} ${planned ? 'planned' : ''} ${scheduledRing.length ? 'scheduled' : ''} ${filteredOut ? 'filtered-out' : ''} ${inProgress ? 'in-progress' : ''} ${key === todayKey ? 'today' : ''} ${todayRing ? 'today-ringed' : ''} ${!previewMode && key < todayKey ? 'past' : ''} ${key === selectedDate ? 'selected' : ''} ${key > todayKey ? 'future' : ''}`}
                          key={key}
                          data-date={key}
                          style={
                            inProgress && activeWorkoutColor
                              ? ({ '--live-color': activeWorkoutColor } as CSSProperties)
                              : dayRingStyle
                                ? ({ '--day-ring': dayRingStyle } as CSSProperties)
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
                                  : `${readOnly ? 'No workouts' : key > todayKey ? 'Plan' : 'Create workout'} for ${prettyDate(key)}${scheduledNote ? `, ${scheduledNote}` : ''}`
                          }
                          title={
                            previewMode
                              ? `${prettyDate(key)}: ${planned?.label ?? 'Not started'}`
                              : inProgress
                                ? `${prettyDate(key)}: workout in progress`
                                : entry
                                  ? `${prettyDate(key)}: ${entry.workout_count} ${entry.workout_count === 1 ? 'workout' : 'workouts'}, ${entry.set_count} ${entry.set_count === 1 ? 'set' : 'sets'}`
                                  : scheduledNote
                                    ? `${prettyDate(key)}: ${scheduledNote}`
                                    : prettyDate(key)
                          }
                        >
                          {todayRing && (
                            <span
                              className="calendar-today-ring"
                              aria-hidden="true"
                              style={{ '--day-ring': dayRing(todayColors) } as CSSProperties}
                            />
                          )}
                          <span className="calendar-day-number">{day.getDate()}</span>
                          <span className="calendar-day-dots" aria-hidden="true">
                            {planned ? (
                              planned.colors?.map((color, dotIndex) => (
                                <i key={dotIndex} style={{ backgroundColor: color }} />
                              ))
                            ) : inProgress ? (
                              <i className="calendar-live-dot" />
                            ) : (
                              dayTypes.map((type, dotIndex) =>
                                hiddenCategories?.has(type.id) ? (
                                  <i key={dotIndex} className="is-off" />
                                ) : (
                                  <i
                                    key={dotIndex}
                                    style={{
                                      backgroundColor: workoutTypeColor(type, categoryColors),
                                    }}
                                  />
                                ),
                              )
                            )}
                          </span>
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
      activeWorkoutColor,
      selectedDate,
      categoryColors,
      hiddenCategories,
      map,
      months,
      todayKey,
      types,
      readOnly,
      previewMap,
      previewMode,
      splitDays,
      weekStartDay,
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
              <button
                type="button"
                className="pulse-button secondary small"
                onClick={olderHistory.onLoadOlder}
              >
                Try again
              </button>
            </>
          ) : olderHistory.loadingOlder ? (
            <>
              <span className="calendar-older-spinner" aria-hidden="true" />
              <p>Loading earlier months…</p>
            </>
          ) : (
            <button
              type="button"
              className="pulse-button secondary small"
              onClick={olderHistory.onLoadOlder}
            >
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

/**
 * This week's seven days as large tiles, each naming the workout types trained that day. Every
 * tile keeps room for two names, so the weekday letters and dates line up across the row.
 */
export function WeekStrip({
  entries,
  categoryColors,
  hiddenCategories,
  weekStartDay,
  activeWorkoutDate = null,
  activeWorkoutColor = null,
  selectedDate = null,
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
  /** The colour of the workout type being logged, for the live day's tint and dot. */
  activeWorkoutColor?: string | null;
  selectedDate?: string | null;
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
        const { dayTypes, ring } = calendarDayLook({
          date: key,
          today: todayKey,
          entry,
          types,
          categoryColors,
          hiddenCategories,
        });
        return (
          <button
            type="button"
            className={`week-strip-day ${entry ? 'trained' : ''} ${inProgress ? 'in-progress' : ''} ${key === todayKey ? 'today' : ''} ${key < todayKey ? 'past' : ''} ${key === selectedDate ? 'selected' : ''} ${key > todayKey ? 'future' : ''}`}
            key={key}
            data-date={key}
            style={
              inProgress && activeWorkoutColor
                ? ({ '--live-color': activeWorkoutColor } as CSSProperties)
                : ring.length && !inProgress
                  ? ({ '--day-ring': dayRing(ring) } as CSSProperties)
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
                  : `${key > todayKey ? 'Plan' : 'Create workout'} for ${prettyDate(key)}`
            }
          >
            <span className="week-strip-weekday" aria-hidden="true">
              {WEEKDAY_LETTERS[date.getDay()]}
            </span>
            <span className="week-strip-date">{date.getDate()}</span>
            <span className="week-strip-types" aria-hidden="true">
              {inProgress ? (
                <i className="calendar-live-dot" />
              ) : (
                // Two names fit; a third or later type is counted on the second line instead.
                weekStripLabels(dayTypes, categoryColors, hiddenCategories).map((label) => (
                  <span
                    className={`week-strip-type${label.color ? '' : ' is-off'}`}
                    key={label.id}
                    style={
                      label.color ? ({ '--type-color': label.color } as CSSProperties) : undefined
                    }
                  >
                    {label.text}
                  </span>
                ))
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
