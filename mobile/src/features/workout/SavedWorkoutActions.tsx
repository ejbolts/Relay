import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import { apiSend } from '../../data/api';
import { refreshTraining } from '../../data/queries';
import { Button } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
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
  const client = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const { colors, type } = useTheme();
  const resumedHere = live.live?.resumedWorkoutId === workout.id;

  function confirmDelete() {
    Alert.alert(
      'Delete this workout?',
      'It will be removed from your history, records and weekly totals. This cannot be undone.',
      [
        { text: 'Keep workout', style: 'cancel' },
        {
          text: 'Delete workout',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            apiSend<void>(`/api/workouts/${encodeURIComponent(workout.id)}`, 'DELETE')
              .then(() => {
                // Resuming it here ends too: there is nothing left to save it over.
                if (resumedHere) live.discard();
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                void refreshTraining(client);
                showToast('Workout deleted');
                router.back();
              })
              .catch((reason) =>
                Alert.alert(
                  'Not deleted',
                  reason instanceof Error ? reason.message : 'Could not delete that workout.',
                ),
              )
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  }

  return (
    <View style={styles.actions}>
      <View style={styles.row}>
        <Button
          label="Edit"
          accessibilityLabel={`Edit ${workout.name}`}
          icon={icons.edit}
          variant="secondary"
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
          onPress={() => live.resume(workout)}
          style={{ flex: 1 }}
        />
      </View>
      {children}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: deleting }}
        disabled={deleting}
        onPress={confirmDelete}
        style={({ pressed }) => [styles.delete, pressed && { opacity: 0.6 }]}
      >
        <Text style={[type.callout, { color: colors.danger, fontWeight: '600' }]}>
          {deleting ? 'Deleting…' : 'Delete workout'}
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
