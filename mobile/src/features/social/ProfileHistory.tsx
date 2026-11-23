import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  LINKED_WORKOUT_MISSING,
  linkedSharedWorkoutId,
  linkedWorkoutNeedsMore,
  SHARED_FILTER_DATES_ERROR,
  sharedFilterDatesInvalid,
  sharedFiltersForTarget,
  sharedWorkoutFilterCount,
} from '../../../../frontend/src/sharedHistoryFilters';
import {
  SHARED_HISTORY_KIND,
  SHARED_HISTORY_TABS,
  sharedHistoryEmpty,
  type SharedHistoryTab,
} from '../../../../frontend/src/sharedProfileDisplay';
import {
  recordCountsByWorkout,
  workoutDisplayName,
} from '../../../../frontend/src/trainingSummary';
import type {
  SharedProfile,
  SharedWorkoutFilters,
  WorkoutReactions,
} from '../../../../frontend/src/types';
import { useWeightUnit } from '../../data/queries';
import { Button, Card, CardHeader, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Segmented } from '../../ui/controls';
import { useTheme } from '../../ui/theme';
import { workoutColor } from '../training/useTrainingContext';
import { WorkoutCard, WorkoutDetails } from '../training/WorkoutCard';
import { HistoryFilterButton, HistoryFilterSheet } from './HistoryFilters';
import type { LinkedRow } from './linkedScroll';
import { useSocialNavigation, type LinkedWorkout } from './navigation';
import { ReactionBar } from './ReactionBar';
import { sharedWorkoutList, useSharedWorkoutFilters, useSharedWorkouts } from './socialQueries';

/** A workout nobody has reacted to or commented on. */
const NO_REACTIONS: WorkoutReactions = { counts: [], yours: null, comment_count: 0 };

const NO_OPTIONS = { exercises: [], machines: [] };

/**
 * The shared history, in the web's tabs when the member logs cardio, opening like Training's.
 * Each workout has its reactions and comments under its summary, as in the feed. Its filters
 * (workout type, exercise, machine and dates) open in a sheet from the button beside the title.
 *
 * Opened at a linked workout, it shows that workout's day with the workout open, reading older
 * pages until it loads, and scrolls the profile to it, as the web's session links do.
 */
export function ProfileHistory({
  profile,
  targetWorkout,
  linkedRef,
  onLinkedLayout,
}: {
  profile: SharedProfile;
  targetWorkout?: LinkedWorkout;
  /** The linked workout's row, which the profile keeps in view until the reader scrolls. */
  linkedRef: LinkedRow['targetRef'];
  onLinkedLayout: () => void;
}) {
  const { colors, type } = useTheme();
  const nav = useSocialNavigation();
  const unit = useWeightUnit();
  const [tab, setTab] = useState<SharedHistoryTab>('all');
  const [filters, setFilters] = useState<SharedWorkoutFilters>(() =>
    sharedFiltersForTarget(targetWorkout),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(targetWorkout?.id ?? null);
  const cardioTab = !!profile.cardio_sessions;
  const kind = cardioTab ? SHARED_HISTORY_KIND[tab] : undefined;
  const invalidDates = sharedFilterDatesInvalid(filters);
  const linkedId = linkedSharedWorkoutId(targetWorkout, filters);
  const query = useSharedWorkouts(profile.id, {
    kind,
    filters,
    enabled: profile.can_view && !invalidDates,
  });
  const options = useSharedWorkoutFilters(profile.id, profile.can_view);
  const { workouts, records, reactions } = sharedWorkoutList(query.data);
  const total = query.data?.pages.at(-1)?.total ?? 0;
  const recordCounts = recordCountsByWorkout(records);
  const types = profile.consistency?.workout_types ?? [];
  const thisYear = new Date().getFullYear().toString();
  const filtered = sharedWorkoutFilterCount(filters) > 0;

  // A link can refer to an older workout, beyond the first page that day: read on until it loads.
  const needsMore = linkedWorkoutNeedsMore(workouts, linkedId, total) && query.hasNextPage;
  const { fetchNextPage, isFetching } = query;
  useEffect(() => {
    if (needsMore && !isFetching && !query.isFetchNextPageError) void fetchNextPage();
  }, [needsMore, isFetching, fetchNextPage, query.isFetchNextPageError]);
  const missing =
    !!linkedId &&
    !!query.data &&
    !needsMore &&
    !isFetching &&
    !workouts.some((workout) => workout.id === linkedId);

  function changeFilters(next: SharedWorkoutFilters) {
    setFilters(next);
    setOpenId(null);
  }

  return (
    <Card>
      {cardioTab ? (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Segmented
              accessibilityLabel="Training history"
              values={SHARED_HISTORY_TABS.map(([, label]) => label)}
              selectedIndex={SHARED_HISTORY_TABS.findIndex(([value]) => value === tab)}
              onChange={(index) => setTab(SHARED_HISTORY_TABS[index][0])}
            />
          </View>
          <HistoryFilterButton filters={filters} onPress={() => setFiltersOpen(true)} />
        </View>
      ) : (
        <CardHeader
          title="Workouts"
          action={<HistoryFilterButton filters={filters} onPress={() => setFiltersOpen(true)} />}
        />
      )}
      {missing && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {LINKED_WORKOUT_MISSING}
        </Text>
      )}
      {invalidDates ? (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {SHARED_FILTER_DATES_ERROR}
        </Text>
      ) : query.isPending || (needsMore && !query.isFetchNextPageError) ? (
        <Loading label="Loading workouts" />
      ) : query.error && !workouts.length ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : workouts.length === 0 ? (
        <Text style={[type.callout, { color: colors.secondary }]}>
          {sharedHistoryEmpty(kind, filtered)}
        </Text>
      ) : (
        <View>
          {workouts.map((workout, index) => (
            <View
              key={workout.id}
              ref={workout.id === linkedId ? linkedRef : undefined}
              onLayout={workout.id === linkedId ? onLinkedLayout : undefined}
              style={
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.line,
                }
              }
            >
              <WorkoutCard
                workout={workout}
                color={workoutColor(workout, types)}
                records={recordCounts.get(workout.id) ?? 0}
                open={openId === workout.id}
                showYear={workout.workout_date.slice(0, 4) !== thisYear}
                onToggle={() => setOpenId(openId === workout.id ? null : workout.id)}
              >
                <WorkoutDetails
                  workout={workout}
                  personalRecords={records}
                  bodyweight={null}
                  unit={unit}
                />
              </WorkoutCard>
              <View style={{ paddingBottom: 10 }}>
                <ReactionBar
                  workoutId={workout.id}
                  subject={`${profile.is_you ? 'Your' : `${profile.display_name}’s`} ${workoutDisplayName(workout)}`}
                  reactions={reactions[workout.id] ?? NO_REACTIONS}
                  ownWorkout={profile.is_you}
                  onOpenComments={() =>
                    nav.openWorkout({
                      id: workout.id,
                      memberId: profile.id,
                      date: workout.workout_date,
                      comments: true,
                    })
                  }
                  onOpenPerson={nav.openProfile}
                />
              </View>
            </View>
          ))}
        </View>
      )}
      {query.error && workouts.length > 0 && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {errorMessage(query.error)}
        </Text>
      )}
      {query.hasNextPage && (!needsMore || query.isFetchNextPageError) && !invalidDates && (
        <Button
          label={
            query.isFetchNextPageError
              ? 'Retry loading older workouts'
              : query.isFetchingNextPage
                ? 'Loading…'
                : 'Show older workouts'
          }
          variant="secondary"
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      )}
      <HistoryFilterSheet
        visible={filtersOpen}
        filters={filters}
        options={options.data ?? NO_OPTIONS}
        onChange={changeFilters}
        onClose={() => setFiltersOpen(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
