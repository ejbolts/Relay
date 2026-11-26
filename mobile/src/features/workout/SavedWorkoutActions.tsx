import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import { Button } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { usePendingWorkoutDeletions, useWorkoutDeletion } from '../training/workoutDeletion';
import { useWorkout } from './WorkoutProvider';

const icons = {
  edit: 'edit',
  resume: { sf: 'play.circle', md: 'play-circle-outline' },
} as const;

/**
 * What a saved workout offers, as on the web: edit it, resume it to log more (it saves over the
 * same workout), or delete it. `children` (such as Repeat) go between them and Delete.
 */
export function SavedWorkoutActions({
  workout,
  children,
}: {
  workout: TrackedWorkout;
  children?: ReactNode;
}) {
  const live = useWorkout();
  const router = useRouter();
  const deletion = useWorkoutDeletion();
  // Already deleted and waiting for its Undo to pass (a screen opened again meanwhile).
  const deleting = usePendingWorkoutDeletions().includes(workout.id);
  const { colors, type } = useTheme();
  const resumedHere = live.live?.resumedWorkoutId === workout.id;

  // Deleted at once with Undo, as on the web; the delete is sent when the toast ends.
  function deleteWorkout() {
    if (deletion.request(workout)) router.back();
  }

  return (
    <View style={styles.actions}>
      <View style={styles.row}>
        <Button
          label="Edit"
          accessibilityLabel={`Edit ${workout.name}`}
          icon={icons.edit}
          variant="secondary"
          // Waiting on its Undo, it is about to be deleted: a change now would be deleted with it.
          disabled={deleting}
          onPress={() =>
            router.push({ pathname: '/edit-workout/[id]', params: { id: workout.id } })
          }
          style={{ flex: 1 }}
        />
        <Button
          label={resumedHere ? 'Open' : 'Resume'}
          accessibilityLabel={resumedHere ? 'Open the resumed workout' : `Resume ${workout.name}`}
          icon={icons.resume}
          variant="secondary"
          disabled={deleting}
          onPress={() => live.resume(workout)}
          style={{ flex: 1 }}
        />
      </View>
      {children}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: deleting }}
        disabled={deleting}
        onPress={deleteWorkout}
        style={({ pressed }) => [styles.delete, pressed && { opacity: 0.6 }]}
      >
        <Text style={[type.callout, { color: colors.danger, fontWeight: '600' }]}>
          {deleting ? 'Deleted' : 'Delete workout'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  delete: { alignItems: 'center', paddingVertical: 12 },
});
