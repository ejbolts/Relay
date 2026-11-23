import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { sharedHistoryEmpty } from '../../../../../frontend/src/sharedProfileDisplay';
import { recordCountsByWorkout } from '../../../../../frontend/src/trainingSummary';
import type { WorkoutType } from '../../../../../frontend/src/types';
import { OFFLINE_MESSAGE, waitingForNetwork } from '../../../data/offline';
import { useWeightUnit } from '../../../data/queries';
import { Button, ErrorState, errorMessage, Loading } from '../../../ui/components';
import { Sheet } from '../../../ui/Sheet';
import { useTheme } from '../../../ui/theme';
import { workoutColor } from '../../training/useTrainingContext';
import { WorkoutCard, WorkoutDetails } from '../../training/WorkoutCard';
import { useSocialNavigation } from '../navigation';
import { sharedWorkoutList, useSharedWorkouts } from '../socialQueries';

/**
 * A member's workouts for one calendar day or one head-to-head lift, shown in a sheet so
 * tapping a day or lift opens their matching sessions without altering the main history list.
 */
export function ProfileWorkoutsSheet({
  visible,
  profileId,
  workoutTypes,
  kicker,
  title,
  date,
  exerciseId,
  onClose,
}: {
  visible: boolean;
  profileId: string;
  workoutTypes: WorkoutType[];
  kicker: string;
  title: string;
  date?: string;
  exerciseId?: string;
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  const nav = useSocialNavigation();
  const unit = useWeightUnit();
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useSharedWorkouts(profileId, { date, exerciseId, enabled: visible });
  const { workouts, records } = sharedWorkoutList(query.data);
  const recordCounts = recordCountsByWorkout(records);
  const thisYear = new Date().getFullYear().toString();
  const offline = waitingForNetwork(query);
  const expandedId = workouts.length === 1 ? workouts[0].id : openId;

  return (
    <Sheet visible={visible} onClose={onClose} kicker={kicker} title={title}>
      {offline ? (
        <ErrorState message={OFFLINE_MESSAGE} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading label="Loading workouts" />
      ) : query.error && !workouts.length ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : workouts.length === 0 ? (
        <Text style={[type.callout, { color: colors.secondary }]}>
          {sharedHistoryEmpty(undefined, true)}
        </Text>
      ) : (
        <View>
          {workouts.map((workout, index) => (
            <View
              key={workout.id}
              style={
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.line,
                }
              }
            >
              <WorkoutCard
                workout={workout}
                color={workoutColor(workout, workoutTypes)}
                records={recordCounts.get(workout.id) ?? 0}
                open={expandedId === workout.id}
                showYear={workout.workout_date.slice(0, 4) !== thisYear}
                onToggle={() => setOpenId(expandedId === workout.id ? null : workout.id)}
              >
                <WorkoutDetails
                  workout={workout}
                  personalRecords={records}
                  bodyweight={null}
                  unit={unit}
                />
                <View style={styles.actions}>
                  <Button
                    label="Open workout"
                    variant="secondary"
                    size="small"
                    icon="chevronRight"
                    onPress={() => {
                      onClose();
                      nav.openWorkout({
                        id: workout.id,
                        memberId: profileId,
                        date: workout.workout_date,
                      });
                    }}
                  />
                </View>
              </WorkoutCard>
            </View>
          ))}
        </View>
      )}
      {query.error && workouts.length > 0 && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {errorMessage(query.error)}
        </Text>
      )}
      {query.hasNextPage && (
        <Button
          label={query.isFetchingNextPage ? 'Loading…' : 'Show older workouts'}
          variant="secondary"
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { paddingBottom: 12, alignItems: 'flex-start' },
});
