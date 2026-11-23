import { Stack, useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { workoutDisplayName } from '../../../../frontend/src/trainingSummary';
import { effectiveWorkoutType } from '../../../../frontend/src/workoutTypes';
import { Button, Card, errorMessage, Loading } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { SavedWorkoutSocial } from '../social';
import { SavedWorkoutActions } from '../workout/SavedWorkoutActions';
import { Badge, Note } from './parts';
import { RepeatWorkoutButton } from './RepeatWorkoutButton';
import { useSavedWorkout } from './trainingQueries';
import { useTrainingContext } from './useTrainingContext';
import { workoutMeta, workoutMetric, WorkoutDetails } from './WorkoutCard';

/** One saved workout in full, with ways to edit, resume, delete or repeat it. */
export function SessionDetailScreen({
  workoutId,
  exerciseId,
}: {
  workoutId: string;
  /** The exercise it was opened from, outlined among the others. */
  exerciseId?: string;
}) {
  const { colors, space, type } = useTheme();
  const router = useRouter();
  const context = useTrainingContext();
  const query = useSavedWorkout(workoutId);
  const workout = query.data;
  const records = workout ? (context.recordCounts.get(workout.id) ?? 0) : 0;
  return (
    <>
      <Stack.Screen options={{ title: workout ? workoutDisplayName(workout) : 'Workout' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: space.lg,
          gap: space.lg,
          paddingBottom: space.xxl * 2,
        }}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
      >
        {query.isPending ? (
          <Loading label="Loading workout" />
        ) : !workout ? (
          <Note
            action={
              <Button label="Try again" variant="secondary" onPress={() => void query.refetch()} />
            }
          >
            {errorMessage(query.error)}
          </Note>
        ) : (
          <>
            <Card>
              <View style={styles.summary}>
                <View style={[styles.bar, { backgroundColor: context.colorOf(workout) }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.titleRow}>
                    <Text style={[type.footnote, { color: colors.secondary }]}>
                      {effectiveWorkoutType(workout, context.types).name}
                    </Text>
                    {workout.is_sample && <Badge label="Sample" />}
                  </View>
                  <Text style={[type.footnote, { color: colors.secondary }]}>
                    {workoutMeta(workout, true)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={[type.headline, type.number, { color: colors.text }]}>
                    {workoutMetric(workout, context.unit)}
                  </Text>
                  {records > 0 && (
                    <Text style={[type.caption, { color: colors.gold, fontWeight: '700' }]}>
                      {records} {records === 1 ? 'PR' : 'PRs'}
                    </Text>
                  )}
                </View>
              </View>
              <WorkoutDetails
                workout={workout}
                personalRecords={context.personalRecords}
                bodyweight={context.bodyweightOn(workout.workout_date)}
                unit={context.unit}
                highlightExerciseId={exerciseId}
                onOpenExercise={(id) =>
                  id !== exerciseId &&
                  router.push({
                    pathname: '/training/exercise/[id]',
                    params: { id },
                  })
                }
              />
            </Card>
            {/* W5 (Social): the workout's photos and Share. */}
            <SavedWorkoutSocial workout={workout} records={records} inset={space.lg * 2} />
            <SavedWorkoutActions workout={workout}>
              <RepeatWorkoutButton workout={workout} unit={context.unit} />
            </SavedWorkoutActions>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
