import { Pressable, StyleSheet, Text, View } from 'react-native';
import { prettyDate } from '../../../../frontend/src/appShared';
import { sharedBodyweight } from '../../../../frontend/src/relativeStrength';
import type { HeatmapDay, WorkoutType } from '../../../../frontend/src/types';
import { formatMinutesDuration } from '../../../../frontend/src/utils';
import { formatWeight, type WeightUnit } from '../../../../frontend/src/weightUnits';
import { effectiveWorkoutType } from '../../../../frontend/src/workoutTypes';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { Divider } from './parts';
import { workoutColor } from './useTrainingContext';

/** A logged calendar day: its workouts, each opening the full session. */
export function CalendarDaySheet({
  day,
  types,
  unit,
  onClose,
  onOpenWorkout,
}: {
  day: HeatmapDay | null;
  types: WorkoutType[];
  unit: WeightUnit;
  onClose: () => void;
  onOpenWorkout: (workoutId: string) => void;
}) {
  const { colors, radius, type } = useTheme();
  return (
    <Sheet
      visible={!!day}
      onClose={onClose}
      kicker="TRAINING DAY"
      title={day ? prettyDate(day.workout_date) : ''}
    >
      {day?.workouts.map((workout) => {
        const bodyweight = sharedBodyweight(workout.exercises);
        return (
          <View
            key={workout.id}
            style={[styles.workout, { backgroundColor: colors.surface2, borderRadius: radius.lg }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${workout.name}`}
              onPress={() => onOpenWorkout(workout.id)}
              style={({ pressed }) => [styles.open, pressed && { opacity: 0.6 }]}
            >
              <View style={[styles.bar, { backgroundColor: workoutColor(workout, types) }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.headline, { color: colors.text }]}>{workout.name}</Text>
                <Text style={[type.footnote, { color: colors.secondary }]}>
                  {[
                    effectiveWorkoutType(workout, types).name,
                    formatMinutesDuration(workout.duration_minutes),
                    bodyweight !== null ? `at ${formatWeight(bodyweight, unit)} BW` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Icon name="chevronRight" size={14} color={colors.muted} />
            </Pressable>
            <Divider />
            {workout.exercises.map((exercise) => (
              <View key={exercise.exercise_name} style={styles.exercise}>
                <Text style={[type.callout, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {exercise.exercise_name}
                  {exercise.bodyweight_kg !== null && bodyweight === null
                    ? ` · at ${formatWeight(exercise.bodyweight_kg, unit)} BW`
                    : ''}
                </Text>
                <Text style={[type.footnote, type.number, { color: colors.secondary }]}>
                  {exercise.set_count} {exercise.set_count === 1 ? 'set' : 'sets'}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  workout: { padding: 14, gap: 8 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
  },
});
