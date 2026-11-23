import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { prettyDate } from '../../../../frontend/src/appShared';
import { sharedBodyweight } from '../../../../frontend/src/relativeStrength';
import type { HeatmapDay } from '../../../../frontend/src/types';
import { formatMinutesDuration } from '../../../../frontend/src/utils';
import { formatWeight } from '../../../../frontend/src/weightUnits';
import { effectiveWorkoutType } from '../../../../frontend/src/workoutTypes';
import { useWeightUnit } from '../../data/queries';
import { Button } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useTypeColors } from './homeData';
import { HomeSheet, useCloseThen } from './HomeSheet';

/**
 * A logged calendar day, as the web's day sheet shows it: its workouts and the sets of each
 * exercise. A workout opens its session in Training, Edit workout opens the editor, and Add
 * another workout asks to log one more on that date (`onAdd`).
 */
export function DaySheet({
  day,
  onClose,
  onAdd,
}: {
  day: HeatmapDay | null;
  onClose: () => void;
  onAdd: (date: string) => void;
}) {
  const router = useRouter();
  const { closeThen, onDismiss } = useCloseThen(onClose);
  return (
    <HomeSheet
      visible={!!day}
      onClose={onClose}
      onDismiss={onDismiss}
      kicker="TRAINING DAY"
      title={day ? prettyDate(day.workout_date) : ''}
    >
      {day && (
        <DayContent
          day={day}
          onOpen={(id) =>
            closeThen(() => router.push({ pathname: '/training/session/[id]', params: { id } }))
          }
          onEdit={(id) =>
            closeThen(() => router.push({ pathname: '/edit-workout/[id]', params: { id } }))
          }
          onAdd={() => closeThen(() => onAdd(day.workout_date))}
        />
      )}
    </HomeSheet>
  );
}

function DayContent({
  day,
  onOpen,
  onEdit,
  onAdd,
}: {
  day: HeatmapDay;
  onOpen: (workoutId: string) => void;
  onEdit: (workoutId: string) => void;
  onAdd: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const weightUnit = useWeightUnit();
  const { types, categoryColors } = useTypeColors();
  return (
    <>
      {day.workouts.map((workout) => {
        const workoutType = effectiveWorkoutType(workout, types);
        const bodyweight = sharedBodyweight(workout.exercises);
        return (
          <View
            key={workout.id}
            style={[styles.workout, { backgroundColor: colors.surface2, borderRadius: radius.lg }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${workout.name}`}
              onPress={() => onOpen(workout.id)}
              style={({ pressed }) => [styles.workoutHead, pressed && { opacity: 0.6 }]}
            >
              <View
                style={[
                  styles.bar,
                  {
                    backgroundColor: workout.workout_type_id
                      ? workoutType.color
                      : categoryColors[workout.category],
                    borderRadius: radius.pill,
                  },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={[type.headline, { color: colors.text }]}>{workout.name}</Text>
                <Text style={[type.footnote, { color: colors.muted }]}>
                  {workoutType.name} · {formatMinutesDuration(workout.duration_minutes)}
                  {bodyweight !== null && ` · at ${formatWeight(bodyweight, weightUnit)} BW`}
                </Text>
              </View>
              <Icon name="chevronRight" size={14} color={colors.muted} />
            </Pressable>
            <View style={{ gap: 8, paddingLeft: 18 }}>
              {workout.exercises.map((exercise) => (
                <View key={exercise.exercise_name} style={styles.exercise}>
                  <Text style={[type.callout, { color: colors.text, flex: 1 }]}>
                    {exercise.exercise_name}
                    {exercise.bodyweight_kg !== null &&
                      bodyweight === null &&
                      ` · at ${formatWeight(exercise.bodyweight_kg, weightUnit)} BW`}
                  </Text>
                  <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>
                    {exercise.set_count} {exercise.set_count === 1 ? 'set' : 'sets'}
                  </Text>
                </View>
              ))}
            </View>
            <Button
              label="Edit workout"
              accessibilityLabel={`Edit ${workout.name}`}
              icon="edit"
              variant="secondary"
              style={{ backgroundColor: colors.surface }}
              onPress={() => onEdit(workout.id)}
            />
          </View>
        );
      })}
      <Button label="Add another workout" icon="plus" variant="secondary" onPress={onAdd} />
    </>
  );
}

const styles = StyleSheet.create({
  workout: { padding: 14, gap: 12 },
  workoutHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { width: 6, alignSelf: 'stretch' },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
