import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sharedBodyweight } from '../../../../frontend/src/relativeStrength';
import type { HeatmapDay } from '../../../../frontend/src/types';
import { formatMinutesDuration } from '../../../../frontend/src/utils';
import { formatWeight } from '../../../../frontend/src/weightUnits';
import { effectiveWorkoutType } from '../../../../frontend/src/workoutTypes';
import { useWeightUnit } from '../../data/queries';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useTypeColors } from './homeData';
import { prettyDate } from './prettyDate';

/**
 * A logged calendar day: its workouts and the sets of each exercise, as the web's day sheet shows
 * them. A native page sheet on iOS; Android draws a bottom sheet over a dimmed backdrop.
 */
export function DaySheet({ day, onClose }: { day: HeatmapDay | null; onClose: () => void }) {
  const ios = Platform.OS === 'ios';
  return (
    <Modal
      visible={!!day}
      animationType={ios ? 'slide' : 'fade'}
      presentationStyle={ios ? 'pageSheet' : undefined}
      transparent={!ios}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {day &&
        (ios ? (
          <DayContent day={day} onClose={onClose} />
        ) : (
          <AndroidSheet day={day} onClose={onClose} />
        ))}
    </Modal>
  );
}

function AndroidSheet({ day, onClose }: { day: HeatmapDay; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
      />
      <View
        style={[
          styles.androidCard,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
        <DayContent day={day} onClose={onClose} />
      </View>
    </View>
  );
}

function DayContent({ day, onClose }: { day: HeatmapDay; onClose: () => void }) {
  const { colors, type, radius } = useTheme();
  const weightUnit = useWeightUnit();
  const { types, categoryColors } = useTypeColors();
  return (
    <ScrollView
      style={{ backgroundColor: Platform.OS === 'ios' ? colors.surface : 'transparent' }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[type.eyebrow, { color: colors.muted }]}>TRAINING DAY</Text>
          <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
            {prettyDate(day.workout_date)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          onPress={onClose}
          style={({ pressed }) => [
            styles.close,
            { backgroundColor: colors.surface2 },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Icon name="close" size={18} color={colors.text} />
        </Pressable>
      </View>
      {day.workouts.map((workout) => {
        const workoutType = effectiveWorkoutType(workout, types);
        const bodyweight = sharedBodyweight(workout.exercises);
        return (
          <View key={workout.id} style={{ gap: 10 }}>
            <View style={styles.workoutHead}>
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
            </View>
            <View style={{ gap: 8, paddingLeft: 20 }}>
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
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  androidCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  content: { padding: 20, paddingTop: 20, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { width: 6, alignSelf: 'stretch' },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
