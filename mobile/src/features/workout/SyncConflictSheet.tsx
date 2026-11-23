import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { workoutSyncDifferences } from '../../../../frontend/src/activeWorkoutSyncDiff';
import type { Exercise } from '../../../../frontend/src/types';
import { finalizeWorkoutIdentity } from '../../../../frontend/src/workoutCategory';
import { Button } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { useLogger, useWorkout } from './WorkoutProvider';

/**
 * When the workout in progress changed on this phone and another device at once in ways that
 * can't be combined, the web's choice: only what differs, then keep this device's version or the
 * other's. Closing it leaves a button to come back to it; the workout keeps logging meanwhile.
 */
export function SyncConflictSheet() {
  const { syncConflict, syncConflictOpen, showSyncConflict, resolveSync } = useWorkout();
  const logger = useLogger();
  const { colors, type, radius } = useTheme();
  const exercises: Exercise[] = logger?.exercises ?? [];
  const conflict = syncConflict;
  const remote = conflict?.remote.draft ?? null;
  const named = conflict ? (conflict.local ?? remote) : null;
  // Named as the logger shows it: typed, or from its exercises unless its type was chosen.
  const name = named
    ? finalizeWorkoutIdentity(
        named.movements
          .map((movement) => exercises.find((exercise) => exercise.id === movement.exerciseId))
          .filter((exercise): exercise is Exercise => exercise !== undefined),
        named.category,
        named.name,
        !named.workoutTypeExplicit,
      ).name
    : 'Workout';
  const differences = conflict
    ? workoutSyncDifferences(
        conflict.local,
        remote,
        (id) => exercises.find((exercise) => exercise.id === id)?.name ?? 'Exercise',
        logger?.weightUnit ?? 'kg',
      )
    : [];

  return (
    <Sheet
      visible={!!conflict && syncConflictOpen}
      onClose={() => showSyncConflict(false)}
      title="Workout sync conflict"
    >
      <Text style={[type.body, { color: colors.secondary }]}>
        Both devices changed <Text style={{ color: colors.text, fontWeight: '700' }}>{name}</Text>.
        Choose which version to keep.
      </Text>
      {differences.length > 0 && (
        <View style={{ gap: 8 }}>
          {differences.map((difference) => (
            <View
              key={difference.key}
              style={[
                styles.difference,
                { backgroundColor: colors.surface2, borderRadius: radius.md },
              ]}
            >
              <Text style={[type.footnote, { color: colors.muted, fontWeight: '700' }]}>
                {difference.label}
              </Text>
              <Text style={[type.callout, { color: colors.text }]}>
                This device: {difference.local}
              </Text>
              <Text style={[type.callout, { color: colors.text }]}>
                Other device: {difference.remote}
              </Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.actions}>
        <Button
          label="Use other device"
          variant="secondary"
          onPress={() => resolveSync(false)}
          style={{ flex: 1 }}
        />
        <Button label="Keep this device" onPress={() => resolveSync(true)} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

/** Brings back a closed sync choice; shown over the app while one is waiting. */
export function SyncConflictButton({ bottom }: { bottom?: number }) {
  const { syncConflict, syncConflictOpen, showSyncConflict } = useWorkout();
  const { colors, type, radius } = useTheme();
  const insets = useSafeAreaInsets();
  if (!syncConflict || syncConflictOpen) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Resolve workout sync"
      onPress={() => showSyncConflict(true)}
      style={({ pressed }) => [
        styles.button,
        {
          bottom: bottom ?? insets.bottom + 96,
          backgroundColor: colors.accent,
          borderRadius: radius.pill,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Icon
        name={{ sf: 'arrow.triangle.2.circlepath', md: 'sync-problem' }}
        size={16}
        color={colors.onAccent}
      />
      <Text style={[type.callout, { color: colors.onAccent, fontWeight: '700' }]}>
        Resolve workout sync
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  difference: { padding: 12, gap: 2 },
  actions: { flexDirection: 'row', gap: 10 },
  button: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
