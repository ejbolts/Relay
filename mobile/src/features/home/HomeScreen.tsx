import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { homeSectionLists } from '../../../../frontend/src/homeLayout';
import { calendarCreatePrompt, calendarDayTarget } from '../../../../frontend/src/plannedDay';
import { isoLocalDate, parseLocalDate } from '../../../../frontend/src/trainingSummary';
import type { HeatmapDay } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { queryKeys, useDashboard } from '../../data/queries';
import { Button, Screen } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { bodyKeys } from '../body/bodyQueries';
import { trainingKeys } from '../training/trainingQueries';
import { useWorkout } from '../workout/WorkoutProvider';
import { DaySheet } from './DaySheet';
import { homeKeys, useHomeLayout } from './homeData';
import { HomeHeaderActions } from './HomeHeaderActions';
import { appDrawsSection, HomeSections } from './homeSections';
import { PlannedDaySheet } from './PlannedDaySheet';

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
  const workout = useWorkout();
  const { colors, type } = useTheme();
  const home = useHomeLayout();
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

  /** Asks before starting a workout dated on an empty day, replacing the live one if any. */
  function createOn(date: string) {
    const live = !!workout.live;
    const prompt = calendarCreatePrompt(date, live);
    Alert.alert(prompt.title, prompt.message, [
      { text: prompt.cancel, style: 'cancel' },
      {
        text: prompt.confirm,
        style: prompt.destructive ? 'destructive' : 'default',
        onPress: () => {
          if (live) workout.discard();
          workout.start({ kind: 'empty' }, { date });
        },
      },
    ]);
  }

  function pressDay(date: string, entry: HeatmapDay | undefined) {
    const target = calendarDayTarget(date, today, !!entry, !!split?.enabled);
    if (entry) setDay(entry);
    else if (target === 'planned') setPlannedDate(date);
    else createOn(date);
  }

  return (
    <>
      <Screen
        title="Home"
        eyebrow={parseLocalDate(today).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        actions={
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit Home layout"
              accessibilityState={{ disabled: !canEdit }}
              disabled={!canEdit}
              hitSlop={6}
              onPress={() => router.push('/home-layout')}
              style={({ pressed }) => [
                styles.edit,
                { backgroundColor: colors.surface2 },
                (pressed || !canEdit) && { opacity: canEdit ? 0.7 : 0.4 },
              ]}
            >
              <Icon name="edit" size={18} color={colors.text} />
            </Pressable>
            <HomeHeaderActions />
          </View>
        }
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      >
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
        />
        {visible.length === 0 && (
          <Text style={[type.footnote, { color: colors.muted, textAlign: 'center' }]}>
            Your Home Screen is clear. Use the edit button to add sections.
          </Text>
        )}
      </Screen>
      <DaySheet day={day} onClose={() => setDay(null)} onAdd={createOn} />
      <PlannedDaySheet date={plannedDate} onClose={() => setPlannedDate(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  edit: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  layoutError: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
