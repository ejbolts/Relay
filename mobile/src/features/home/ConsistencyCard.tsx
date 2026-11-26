import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  calendarDayLook,
  liveWorkoutColor,
  todayOutlineColors,
} from '../../../../frontend/src/calendarDayLook';
import {
  calendarMonths,
  calendarWeekdays,
  entriesInMonths,
  monthCountFromOldestWorkout,
} from '../../../../frontend/src/calendarRange';
import { consistencyWeeks } from '../../../../frontend/src/consistencyWeeks';
import { workoutTypeColor } from '../../../../frontend/src/dayColors';
import { splitCalendarDays } from '../../../../frontend/src/trainingSplit';
import {
  isoLocalDate,
  trainingDayGrid,
  weekStartDayFrom,
  weekStartDayOf,
} from '../../../../frontend/src/trainingSummary';
import type {
  HeatmapDay,
  WorkoutCategory,
  WorkoutType,
  WorkoutTypeColors,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { calendarLegendTypes } from '../../../../frontend/src/workoutTypes';
import { useDashboard, useTrainingPreferences, useWorkoutHistory } from '../../data/queries';
import { Card, CardHeader, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme, type Palette } from '../../ui/theme';
import { haptics } from '../../ui/haptics';
import { DayRing } from './DayRing';
import { useTypeColors } from './homeData';
import { prettyDate } from '../../../../frontend/src/appShared';

const NO_ENTRIES: HeatmapDay[] = [];

/** The type of the workout in progress. */
export interface LiveWorkoutType {
  category: WorkoutCategory;
  workoutTypeId: string | null;
}

/**
 * Streak, training days and the weekly average over the last 12 weeks, above the training
 * calendar (newest month first, swipe back for earlier ones) and its legend, as on the web.
 * Every day opens: a logged one its workouts, the others their plan or a new workout.
 */
export function ConsistencyCard({
  liveDate,
  liveType = null,
  onPressDay,
  onOpenLive,
}: {
  liveDate: string | null;
  liveType?: LiveWorkoutType | null;
  onPressDay: (date: string, entry: HeatmapDay | undefined) => void;
  onOpenLive: () => void;
}) {
  const { colors, type } = useTheme();
  const today = localDate();
  const dashboard = useDashboard();
  const history = useWorkoutHistory();
  const preferences = useTrainingPreferences();
  const data = dashboard.data;
  const weekStartDay = weekStartDayFrom(data?.weekly_sets?.week_start ?? data?.zone2?.week_start);
  const trainingDays = useMemo(
    () =>
      trainingDayGrid(history.data ?? [], today, weekStartDay, 12)
        .flat()
        .filter((day) => day.workouts > 0).length,
    [history.data, today, weekStartDay],
  );
  const weeks = consistencyWeeks(data?.history?.first_workout_date, today);
  const streak = data?.current_streak ?? 0;

  return (
    <Card>
      <CardHeader
        title="Consistency"
        action={<Text style={[type.footnote, { color: colors.muted }]}>Last 12 weeks</Text>}
      />
      {dashboard.isPending ? (
        <Loading label="Loading consistency" />
      ) : !data ? (
        <ErrorState
          message={errorMessage(dashboard.error)}
          onRetry={() => void dashboard.refetch()}
        />
      ) : (
        <>
          <View style={styles.stats}>
            <Stat label="Streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} />
            <Stat label="Training days" value={history.data ? String(trainingDays) : '–'} />
            <Stat
              label="Avg / week"
              value={history.data ? (trainingDays / weeks).toFixed(1) : '–'}
            />
          </View>
          <TrainingCalendar
            entries={data.heatmap ?? NO_ENTRIES}
            split={data.training_split}
            weekStartDay={weekStartDayOf(preferences.data?.week_start)}
            liveDate={liveDate}
            liveType={liveType}
            onPressDay={onPressDay}
            onOpenLive={onOpenLive}
          />
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ gap: 2 }}>
      <Text style={[type.footnote, { color: colors.muted }]}>{label}</Text>
      <Text style={[type.title, type.number, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function TrainingCalendar({
  entries,
  split,
  weekStartDay,
  liveDate,
  liveType,
  onPressDay,
  onOpenLive,
}: {
  entries: HeatmapDay[];
  split: Parameters<typeof splitCalendarDays>[0];
  weekStartDay: number;
  liveDate: string | null;
  liveType: LiveWorkoutType | null;
  onPressDay: (date: string, entry: HeatmapDay | undefined) => void;
  onOpenLive: () => void;
}) {
  const { colors, type } = useTheme();
  const { types, categoryColors } = useTypeColors();
  const today = localDate();
  const [width, setWidth] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const months = useMemo(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const count = monthCountFromOldestWorkout(
      [...entries, ...(liveDate ? [{ workout_date: liveDate }] : [])],
      now,
    );
    const oldest = new Date(now.getFullYear(), now.getMonth() - count + 1, 1, 12);
    return calendarMonths(isoLocalDate(oldest), count, 0, weekStartDay);
  }, [entries, liveDate, weekStartDay]);
  const [shownMonth, setShownMonth] = useState<string | null>(null);
  const visibleMonth = shownMonth ?? months.at(-1)?.first.slice(0, 7) ?? null;
  const map = useMemo(
    () => new Map(entries.map((entry) => [entry.workout_date, entry])),
    [entries],
  );
  // Six weeks ahead reaches the end of the current month, the newest one the calendar shows.
  const splitDays = useMemo(() => splitCalendarDays(split, today, 42), [split, today]);
  const legend = calendarLegendTypes(
    entriesInMonths(entries, visibleMonth ? [visibleMonth] : null),
    types,
  );
  const weekdays = calendarWeekdays(weekStartDay);
  // The live day takes the colour of the workout type being logged, as on the web.
  const liveColor = liveDate ? liveWorkoutColor(liveType, types, categoryColors) : null;
  const open = useCallback(
    (date: string) => {
      if (date === liveDate) onOpenLive();
      else onPressDay(date, map.get(date));
    },
    [liveDate, map, onPressDay, onOpenLive],
  );

  return (
    <View
      testID="consistency-calendar"
      style={{ gap: 12 }}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {width > 0 && (
        <FlatList
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          data={months}
          keyExtractor={(month) => month.key}
          initialScrollIndex={months.length - 1}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          initialNumToRender={2}
          windowSize={3}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.x / width);
            const month = months[Math.max(0, Math.min(index, months.length - 1))];
            if (month) setShownMonth(month.first.slice(0, 7));
          }}
          renderItem={({ item: month }) => (
            <View style={{ width, gap: 8 }} accessibilityLabel={month.title}>
              <Text style={[type.callout, { color: colors.text, fontWeight: '700' }]}>
                {month.title}
              </Text>
              <View style={styles.week}>
                {weekdays.map((day, index) => (
                  <Text
                    key={`${day}-${index}`}
                    style={[styles.weekday, { color: colors.muted }]}
                    importantForAccessibility="no"
                  >
                    {day}
                  </Text>
                ))}
              </View>
              {Array.from({ length: 6 }, (_, row) => month.cells.slice(row * 7, row * 7 + 7)).map(
                (week, row) => (
                  <View key={row} style={styles.week}>
                    {week.map((cell, index) =>
                      cell ? (
                        <CalendarDay
                          key={index}
                          date={isoLocalDate(cell)}
                          today={today}
                          entry={map.get(isoLocalDate(cell))}
                          live={isoLocalDate(cell) === liveDate}
                          liveColor={isoLocalDate(cell) === liveDate ? liveColor : null}
                          types={types}
                          categoryColors={categoryColors}
                          hidden={hidden}
                          splitDays={splitDays}
                          colors={colors}
                          onPress={open}
                        />
                      ) : (
                        <View key={index} style={styles.cell} />
                      ),
                    )}
                  </View>
                ),
              )}
            </View>
          )}
        />
      )}
      {legend.length > 0 && (
        <View style={styles.legend} accessibilityLabel="Workout types">
          {legend.map((item) => {
            const shown = !hidden.has(item.id);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="switch"
                accessibilityLabel={item.name}
                accessibilityState={{ checked: shown }}
                hitSlop={6}
                onPress={() => {
                  haptics.selection();
                  setHidden((current) => {
                    const next = new Set(current);
                    if (!next.delete(item.id)) next.add(item.id);
                    return next;
                  });
                }}
                style={({ pressed }) => [styles.legendItem, pressed && { opacity: 0.6 }]}
              >
                <View
                  style={[
                    styles.legendDot,
                    {
                      backgroundColor: shown
                        ? workoutTypeColor(item, categoryColors)
                        : colors.deemph,
                    },
                  ]}
                />
                <Text style={[type.footnote, { color: shown ? colors.secondary : colors.muted }]}>
                  {item.name}
                </Text>
                <Icon name={shown ? 'check' : 'close'} size={12} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const CalendarDay = memo(function CalendarDay({
  date,
  today,
  entry,
  live,
  liveColor,
  types,
  categoryColors,
  hidden,
  splitDays,
  colors,
  onPress,
}: {
  date: string;
  today: string;
  entry: HeatmapDay | undefined;
  live: boolean;
  /** The live workout's type colour, on its day only. */
  liveColor: string | null;
  types: WorkoutType[];
  categoryColors: WorkoutTypeColors;
  hidden: ReadonlySet<string>;
  splitDays: ReadonlyMap<string, readonly string[]>;
  colors: Palette;
  onPress: (date: string) => void;
}) {
  const { dayTypes, ring, filteredOut, scheduledRing, scheduledNote } = calendarDayLook({
    date,
    today,
    entry,
    inProgress: live,
    types,
    categoryColors,
    hiddenCategories: hidden,
    splitDays,
  });
  const isToday = date === today;
  const future = date > today;
  // Today's outline always shows its workout type: the one being logged, the types logged, or
  // before anything starts, the split's plan for today. With none, the accent.
  const todayColors = live
    ? [liveColor ?? colors.accent]
    : todayOutlineColors({ ring, scheduledRing });
  const label = live
    ? `Resume workout in progress for ${prettyDate(date)}`
    : entry
      ? `View ${entry.workout_count} ${entry.workout_count === 1 ? 'workout' : 'workouts'} for ${prettyDate(date)}`
      : `${prettyDate(date)}${scheduledNote ? `, ${scheduledNote}` : ''}`;
  return (
    <View style={styles.cell}>
      {isToday && (
        <View testID="today-outline" pointerEvents="none" style={styles.todayRing}>
          <DayRing
            colors={todayColors.length ? todayColors : [colors.accent]}
            radius={13}
            opacity={0.55}
          />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isToday }}
        onPress={() => onPress(date)}
        style={({ pressed }) => [
          styles.day,
          isToday && { backgroundColor: colors.surface3 },
          live && !liveColor && { backgroundColor: colors.accentSoft },
          future && { opacity: 0.4 },
          pressed && { opacity: 0.6 },
        ]}
      >
        {live && liveColor && (
          <View
            testID="live-day-tint"
            pointerEvents="none"
            style={[styles.liveTint, { backgroundColor: liveColor }]}
          />
        )}
        {!live &&
          (ring.length || filteredOut ? (
            <DayRing colors={filteredOut ? [colors.deemph] : ring} radius={10} />
          ) : scheduledRing.length ? (
            <DayRing colors={scheduledRing} radius={10} opacity={future ? 1 : 0.32} />
          ) : null)}
        <Text
          style={[
            styles.dayNumber,
            {
              color: entry || isToday ? colors.text : colors.secondary,
              fontWeight: isToday ? '700' : entry ? '600' : '500',
            },
          ]}
        >
          {Number(date.slice(8))}
        </Text>
        <View style={styles.dots}>
          {live ? (
            <View style={[styles.dot, { backgroundColor: liveColor ?? colors.accent }]} />
          ) : (
            dayTypes.map((item, index) => (
              <View
                key={`${item.id}-${index}`}
                style={[
                  styles.dot,
                  {
                    backgroundColor: hidden.has(item.id)
                      ? colors.deemph
                      : workoutTypeColor(item, categoryColors),
                  },
                ]}
              />
            ))
          )}
        </View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 24 },
  week: { flexDirection: 'row', gap: 6 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600' },
  cell: { flex: 1, height: 40 },
  todayRing: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3 },
  liveTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 10,
    opacity: 0.14,
  },
  day: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dayNumber: { fontSize: 13 },
  dots: { flexDirection: 'row', gap: 2, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 28 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
