import { StyleSheet, Text, View } from 'react-native';
import { trainedWithLabel } from '../../../../frontend/src/trainTogether';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import { useOptionalSession } from '../../session/SessionProvider';
import { useTheme } from '../../ui/theme';
import { PartnerAvatar } from './PartnerAvatar';

/**
 * "with Sam" on a saved workout trained together: up to three overlapping avatars and the
 * label. A partner the viewer may not see is counted, not named. Nothing for a workout trained
 * alone, or from a server that doesn't say.
 */
export function TrainedWithPill({
  workout,
}: {
  workout: Pick<TrackedWorkout, 'trained_with' | 'trained_with_count'>;
}) {
  const { colors } = useTheme();
  const status = useOptionalSession()?.status;
  const viewerId = status?.kind === 'signed-in' ? status.user.id : null;
  const label = trainedWithLabel(workout.trained_with, workout.trained_with_count, viewerId);
  if (!label) return null;
  const faces = (workout.trained_with ?? []).slice(0, 3);
  return (
    <View
      accessibilityLabel={`Trained ${label}`}
      style={[styles.pill, { backgroundColor: colors.surface2, borderColor: colors.line }]}
    >
      {faces.length > 0 && (
        <View style={styles.faces}>
          {faces.map((person, index) => (
            <View
              key={person.user_id}
              style={[
                styles.face,
                { marginLeft: index ? -5 : 0, borderColor: colors.surface2, zIndex: 3 - index },
              ]}
            >
              <PartnerAvatar member={person} size={18} />
            </View>
          ))}
        </View>
      )}
      <Text style={[styles.text, { color: colors.secondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 3,
    paddingRight: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  faces: { flexDirection: 'row' },
  face: { borderWidth: 1.5, borderRadius: 999 },
  text: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
});
