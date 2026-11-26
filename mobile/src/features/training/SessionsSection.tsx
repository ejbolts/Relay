import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  groupWorkoutsByWeek,
  addDays,
  isoLocalDate,
  dayMonth,
  weekGroupLabel,
  weekGroupSummary,
} from '../../../../frontend/src/trainingSummary';
import type { HeatmapDay, TrackedWorkout } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import {
  historyPageAnchor,
  historyPageForDate,
  historyPageCount,
  historyPageWindow,
} from '../../../../frontend/src/workoutHistory';
import { effectiveWorkoutType } from '../../../../frontend/src/workoutTypes';
import { calendarDayTarget } from '../../../../frontend/src/plannedDay';
import { splitCalendarDays } from '../../../../frontend/src/trainingSplit';
import { useDashboard } from '../../data/queries';
import { Button, Card, CardHeader, IconButton } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useCreateWorkoutOn } from '../home/calendarActions';
import { PlannedDaySheet } from '../home/PlannedDaySheet';
import { useWorkout } from '../workout/WorkoutProvider';
import { CalendarDaySheet } from './CalendarDaySheet';
import { MachineFilterSheet } from './MachineFilterSheet';
import { machineWorkoutsRoute, type MachineFilter } from './MachinePhotos';
import {
  calendarBounds,
  entriesByMonth,
  monthOf,
  monthsBetween,
  monthViews,
} from './calendarModel';
import { Divider, MoreButton, Note } from './parts';
import { RepeatWorkoutButton } from './RepeatWorkoutButton';
import { trainingKeys, type useTrainingHistory } from './trainingQueries';
import { useTrainingContext } from './useTrainingContext';
import { CalendarLegend, WorkoutCalendar } from './WorkoutCalendar';
import { WorkoutCard, WorkoutDetails } from './WorkoutCard';

type History = ReturnType<typeof useTrainingHistory>;

/** Sessions: the calendar, then the log two weeks at a time, as the web's Training tab. */
export function SessionsSection({ history }: { history: History }) {
  const { colors, type } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const workout = useWorkout();
  const context = useTrainingContext();
  const { types, categoryColors, weekStartDay, unit } = context;
  const today = localDate();
  const { workouts, heatmap, summary, historyStart, hasOlder, loadingOlder, olderError } = history;

  // The workout in progress is marked on its day, and tapping that day resumes it, as on the web.
  const liveWorkout = workout.live;
  const live = useMemo(
    () =>
      liveWorkout
        ? {
            date: liveWorkout.workoutDate ?? isoLocalDate(new Date(liveWorkout.startedAt)),
            category: liveWorkout.category ?? null,
            workoutTypeId: liveWorkout.workoutTypeId ?? null,
          }
        : null,
    [liveWorkout],
  );
  // The calendar pages month by month, from the oldest workout to this month.
  const bounds = calendarBounds(today, [
    summary?.first_workout_date,
    heatmap[0]?.workout_date,
    live?.date,
  ]);
  const [month, setMonth] = useState(() => monthOf(today));
  const shownMonth =
    month < bounds.first ? bounds.first : month > bounds.last ? bounds.last : month;
  // Types switched off in the legend leave the calendar, the session list and its totals.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  // The split's planned days ahead and missed days behind, as the web's calendar shows them.
  const split = useDashboard().data?.training_split;
  const splitDays = useMemo(() => splitCalendarDays(split, today, 42), [split, today]);
  // History is grouped by month once; each month's view is then built at most once.
  const byMonth = useMemo(() => entriesByMonth(heatmap), [heatmap]);
  const viewFor = useMemo(
    () =>
      monthViews({ byMonth, types, categoryColors, hidden, weekStartDay, today, splitDays, live }),
    [byMonth, types, categoryColors, hidden, weekStartDay, today, splitDays, live],
  );
  const months = useMemo(
    () => monthsBetween(bounds.first, bounds.last),
    [bounds.first, bounds.last],
  );
  const view = useMemo(() => viewFor(shownMonth), [viewFor, shownMonth]);
  const [selectedDay, setSelectedDay] = useState<HeatmapDay | null>(null);
  const [plannedDate, setPlannedDate] = useState<string | null>(null);
  const createOn = useCreateWorkoutOn();
  // A day opens its workouts, its plan (days ahead, or today with a split) or, on an empty past
  // day, a new workout dated that day: the web's rule (plannedDay.ts).
  const pressDay = (date: string, entry: HeatmapDay | undefined) => {
    const target = calendarDayTarget(date, today, !!entry, !!split?.enabled);
    if (entry) setSelectedDay(entry);
    else if (target === 'planned') setPlannedDate(date);
    else createOn(date);
  };

  // The log counts pages of two weeks, as the web does; earlier pages are added below.
  const [pages, setPages] = useState(1);
  const latest = [summary?.last_workout_date, workouts[0]?.workout_date]
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  const oldest = [summary?.first_workout_date, workouts.at(-1)?.workout_date]
    .filter((date): date is string => Boolean(date))
    .sort()[0];
  const anchor = historyPageAnchor(today, latest);
  const pageCount = historyPageCount(oldest, anchor, weekStartDay);
  const shownPages = Math.min(pages, pageCount);
  const windowStart = historyPageWindow(anchor, weekStartDay, shownPages).start;
  const weekGroups = useMemo(
    () =>
      groupWorkoutsByWeek(
        workouts.filter(
          (item) =>
            item.workout_date >= windowStart && !hidden.has(effectiveWorkoutType(item, types).id),
        ),
        weekStartDay,
      ),
    [workouts, windowStart, hidden, types, weekStartDay],
  );
  const [openId, setOpenId] = useState<string | null>(null);

  // Weeks without workouts are left out, so the next page could look like nothing happened.
  // Jump to the page of the next older workout, reading older months first when none is loaded.
  function showEarlier() {
    const next = workouts.find((item) => item.workout_date < windowStart);
    const target = next?.workout_date ?? (hasOlder ? addDays(historyStart, -1) : null);
    setPages(
      target
        ? Math.max(shownPages + 1, historyPageForDate(target, anchor, weekStartDay))
        : pageCount,
    );
  }

  // Reaching weeks or months before the loaded window reads the next older chunk, as the web
  // does when its calendar scrolls or its Sessions pages go back.
  const needsOlder = hasOlder && (windowStart < historyStart || `${shownMonth}-01` < historyStart);
  const { loadOlder } = history;
  useEffect(() => {
    if (needsOlder && !loadingOlder && !olderError) loadOlder();
  }, [needsOlder, loadingOlder, olderError, loadOlder]);

  function openWorkout(id: string) {
    const loaded = workouts.find((item) => item.id === id);
    if (loaded) client.setQueryData<TrackedWorkout>(trainingKeys.workout(id), loaded);
    setSelectedDay(null);
    router.push({ pathname: '/training/session/[id]', params: { id } });
  }

  function openExercise(id: string) {
    router.push({ pathname: '/training/exercise/[id]', params: { id } });
  }

  // Filter by machine lists every workout on one machine, as the web's filtered Sessions do.
  const [machinePicker, setMachinePicker] = useState(false);
  function filterByMachine(filter: MachineFilter) {
    setMachinePicker(false);
    router.push(machineWorkoutsRoute(filter));
  }

  if (history.loading) return <Note>Loading your training…</Note>;
  if (history.error && !workouts.length)
    return (
      <Note
        action={
          <Button label="Try again" variant="secondary" onPress={() => void history.refresh()} />
        }
      >
        Could not load your training.
      </Note>
    );

  const empty = !workouts.length && !hasOlder;
  return (
    <View style={{ gap: 20 }}>
      <Card accessibilityLabel="Workout calendar">
        <CardHeader
          title="Calendar"
          action={
            (workouts.length > 0 || hasOlder) && (
              <IconButton
                icon="filter"
                accessibilityLabel="Filter by machine"
                onPress={() => setMachinePicker(true)}
              />
            )
          }
        />
        <WorkoutCalendar
          months={months}
          month={shownMonth}
          viewFor={viewFor}
          onMonthChange={setMonth}
          selectedDate={selectedDay?.workout_date ?? plannedDate}
          onSelectDay={(day) => (day.live ? workout.open() : pressDay(day.date, day.entry))}
          loadingOlder={loadingOlder && `${shownMonth}-01` < historyStart}
          olderError={`${shownMonth}-01` < historyStart ? olderError : null}
          onRetryOlder={history.retryOlder}
        />
        <CalendarLegend
          types={view.legend}
          categoryColors={categoryColors}
          hidden={hidden}
          onToggle={(id) => {
            const next = new Set(hidden);
            if (!next.delete(id)) next.add(id);
            setHidden(next);
          }}
        />
      </Card>

      {empty ? (
        <Note
          action={<Button label="Start a workout" icon="play" onPress={workout.openStartMenu} />}
        >
          Your log is empty
        </Note>
      ) : (
        <View style={{ gap: 20 }}>
          {weekGroups.length === 0 && !needsOlder && (
            <Note>
              {shownPages === 1
                ? 'No workouts this week or last week'
                : `No workouts from ${dayMonth(windowStart)} to ${dayMonth(today)}`}
            </Note>
          )}
          {weekGroups.map((group) => {
            const label = weekGroupLabel(group.weekStart, today, weekStartDay);
            return (
              <View key={group.weekStart} style={{ gap: 8 }} accessibilityLabel={label}>
                <View style={styles.weekHeader}>
                  <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
                    {label}
                  </Text>
                  <Text
                    style={[
                      type.footnote,
                      type.number,
                      styles.weekSummary,
                      { color: colors.secondary },
                    ]}
                    numberOfLines={1}
                  >
                    {weekGroupSummary(group, unit)}
                  </Text>
                </View>
                <Card style={styles.list}>
                  {group.workouts.map((item, index) => (
                    <View key={item.id}>
                      {index > 0 && <Divider />}
                      <WorkoutCard
                        workout={item}
                        color={context.colorOf(item)}
                        records={context.recordCounts.get(item.id) ?? 0}
                        open={openId === item.id}
                        showYear={item.workout_date.slice(0, 4) !== today.slice(0, 4)}
                        onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                      >
                        <WorkoutDetails
                          workout={item}
                          personalRecords={context.personalRecords}
                          bodyweight={context.bodyweightOn(item.workout_date)}
                          unit={unit}
                          onOpenExercise={openExercise}
                          onFilterMachine={filterByMachine}
                        />
                        <View style={styles.actions}>
                          <RepeatWorkoutButton workout={item} unit={unit} />
                        </View>
                      </WorkoutCard>
                    </View>
                  ))}
                </Card>
              </View>
            );
          })}
          {needsOlder && olderError ? (
            <Note
              action={
                <Button
                  label="Retry loading older workouts"
                  variant="secondary"
                  onPress={history.retryOlder}
                />
              }
            >
              {olderError}
            </Note>
          ) : needsOlder ? (
            <MoreButton label="Loading older workouts" loading onPress={() => undefined} />
          ) : (
            shownPages < pageCount && (
              <MoreButton label="Show earlier weeks" onPress={showEarlier} />
            )
          )}
        </View>
      )}
      <CalendarDaySheet
        day={selectedDay}
        types={types}
        unit={unit}
        onClose={() => setSelectedDay(null)}
        onOpenWorkout={openWorkout}
      />
      <PlannedDaySheet date={plannedDate} onClose={() => setPlannedDate(null)} />
      <MachineFilterSheet
        visible={machinePicker}
        onSelect={filterByMachine}
        onClose={() => setMachinePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  weekSummary: { flexShrink: 1, textAlign: 'right' },
  list: { paddingVertical: 0, gap: 0 },
  actions: { paddingBottom: 16 },
});
