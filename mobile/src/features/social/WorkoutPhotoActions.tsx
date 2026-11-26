import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { workoutDisplayName } from '../../../../frontend/src/trainingSummary';
import type { TrackedWorkout, WorkoutPhoto } from '../../../../frontend/src/types';
import { Button } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { socialIcons } from './icons';
import { ShareWorkoutSheet } from './ShareWorkoutSheet';
import { useWorkoutPhotoEditor, WorkoutPhotos } from './WorkoutPhotos';

/** Your own workout's photos, which you can remove, with Add photo (and any other buttons). */
export function WorkoutPhotoActions({
  workoutId,
  photos,
  subject,
  inset,
  children,
}: {
  workoutId: string;
  photos: WorkoutPhoto[];
  subject: string;
  inset: number;
  children?: ReactNode;
}) {
  const { colors, type } = useTheme();
  const editor = useWorkoutPhotoEditor(workoutId, photos);
  return (
    <View style={{ gap: 10 }}>
      <WorkoutPhotos
        photos={photos}
        subject={subject}
        inset={inset}
        full
        onRemove={editor.remove}
      />
      {(editor.canAdd || children) && (
        <View style={styles.row}>
          {editor.canAdd && (
            <Button
              label={editor.adding ? 'Adding…' : 'Add photo'}
              accessibilityLabel={editor.adding ? 'Adding photo…' : `Add a photo to ${subject}`}
              icon={socialIcons.addPhoto}
              variant="secondary"
              disabled={editor.adding}
              onPress={editor.add}
              style={styles.button}
            />
          )}
          {children}
        </View>
      )}
      {editor.error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {editor.error}
        </Text>
      )}
    </View>
  );
}

/**
 * Training's session screen additions from Social: the workout's photos, which you can add and
 * remove, and Share, for its share card or a CSV of its sets.
 */
export function SavedWorkoutSocial({
  workout,
  records,
  inset,
}: {
  workout: TrackedWorkout;
  records: number;
  inset: number;
}) {
  const [sharing, setSharing] = useState(false);
  return (
    <>
      <WorkoutPhotoActions
        workoutId={workout.id}
        photos={workout.photos ?? []}
        subject={`Your ${workoutDisplayName(workout)}`}
        inset={inset}
      >
        <Button
          label="Share"
          icon={socialIcons.share}
          variant="secondary"
          onPress={() => setSharing(true)}
          style={styles.button}
        />
      </WorkoutPhotoActions>
      {sharing && (
        <ShareWorkoutSheet workout={workout} records={records} onClose={() => setSharing(false)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  button: { flex: 1 },
});
