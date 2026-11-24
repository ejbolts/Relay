import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { homeDateLine } from '../../../../frontend/src/homeDateLine';
import { homeSectionLists } from '../../../../frontend/src/homeLayout';
import { calendarDayTarget } from '../../../../frontend/src/plannedDay';
import { isoLocalDate } from '../../../../frontend/src/trainingSummary';
import type { HeatmapDay } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { queryKeys, useDashboard } from '../../data/queries';
import { Button } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { useTheme } from '../../ui/theme';
import { LaunchNotices } from '../review';
import { CheckInSyncCard } from '../body/BodyCheckInSync';
import { bodyKeys } from '../body/bodyQueries';
import { settingsKeys } from '../settings/settingsData';
import { trainingKeys } from '../training/trainingQueries';
import { useWorkout } from '../workout/WorkoutProvider';
import { HomeGuides } from '../guides/HomeGuides';
import { useCreateWorkoutOn } from './calendarActions';
import { DaySheet } from './DaySheet';
import { homeKeys, useHomeLayout } from './homeData';
import { HomeHeaderActions } from './HomeHeaderActions';
import { HomePage } from './HomePage';
import { appDrawsSection, HomeSections } from './homeSections';
import { PlannedDayPrefetch, PlannedDaySheet } from './PlannedDaySheet';

// Everything Home shows, refreshed together by pull to refresh.
const HOME_QUERIES = [
  ['dashboard'],
  ['workouts'],
  homeKeys.layout,
  queryKeys.workoutTypes,
  queryKeys.savedExercises,
  queryKeys.trainingPreferences,
  queryKeys.personalRecords,
  bodyKeys.measurements,
  bodyKeys.goals,
  trainingKeys.cardio,
  ['social', 'feed'],
  ['social', 'choices'],
  ['social', 'friends'],
  // Active only while a split with a routine keeps it warm (below).
  settingsKeys.routines,
];

/**
 * Home, as the account's saved layout arranges it (the web's default order until one is saved):
 * its cards in order, hidden ones left out, and each card's saved settings. Each card loads and
 * fails on its own. The pencil opens the layout editor. Tapping a calendar day opens its
 * workouts, its plan, or the question whether to log a workout on that date, as on the web.
 */
export function HomeScreen() {
  const client = useQueryClient();
  const router = useRouter();
  const focused = useIsFocused();
  const workout = useWorkout();
  const { colors, type } = useTheme();
  const home = useHomeLayout();
  const createOn = useCreateWorkoutOn();
  const split = useDashboard().data?.training_split;
  const [refreshing, setRefreshing] = useState(false);
  const [day, setDay] = useState<HeatmapDay | null>(null);
  const [plannedDate, setPlannedDate] = useState<string | null>(null);
  const today = localDate();
  // The live workout's day: today, or the earlier day it was started for.
  const liveDate = workout.live
    ? (workout.live.workoutDate ?? isoLocalDate(new Date(workout.live.startedAt)))
    : null;
  const { visible } = homeSectionLists(home.layout, appDrawsSection);
  // Editing waits for the server's layout, so an older copy is never saved over a newer one.
  const canEdit = home.confirmed;

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all(
        HOME_QUERIES.map((queryKey) => client.refetchQueries({ queryKey, type: 'active' })),
      );
    } finally {
      setRefreshing(false);
    }
  }

  function pressDay(date: string, entry: HeatmapDay | undefined) {
    const target = calendarDayTarget(date, today, !!entry, !!split?.enabled);
    if (entry) setDay(entry);
    else if (target === 'planned') setPlannedDate(date);
    else createOn(date);
  }

  return (
    <>
      <HomePage
        title="Home"
        eyebrow={homeDateLine(today)}
        // B4 (guides): the tips pill, the quick tour and the "Still working out?" alert.
        eyebrowAccessory={<HomeGuides />}
        actions={<HomeHeaderActions canEdit={canEdit} />}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      >
        <CheckInSyncCard />
        {home.isError && !home.confirmed && (
          <View style={styles.layoutError}>
            <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
              Could not load your saved layout.
            </Text>
            <Button label="Retry" variant="link" onPress={() => void home.refetch()} />
          </View>
        )}
        <HomeSections
          visible={visible}
          layout={home.layout}
          liveDate={liveDate}
          onPressDay={pressDay}
          onOpenLive={workout.open}
          onHoldToEdit={
            canEdit && focused
              ? () => {
                  haptics.press();
                  router.push('/home-layout');
                }
              : undefined
          }
        />
        {visible.length === 0 && (
          <Text style={[type.footnote, { color: colors.muted, textAlign: 'center' }]}>
            Your Home Screen is clear. Use the edit button to add sections.
          </Text>
        )}
      </HomePage>
      <DaySheet day={day} onClose={() => setDay(null)} onAdd={createOn} />
      {split?.enabled && !!split.routine_id && <PlannedDayPrefetch />}
      <PlannedDaySheet date={plannedDate} onClose={() => setPlannedDate(null)} />
      {/* B3: What's new once per release, or last week's review at the start of a week. */}
      <LaunchNotices />
    </>
  );
}

const styles = StyleSheet.create({
  layoutError: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
