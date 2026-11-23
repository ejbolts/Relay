import { Alert, StyleSheet, Text, View } from 'react-native';
import { formatMinutesDuration } from '../../../../frontend/src/utils';
import { Button } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import type { RefusedSave } from './WorkoutProvider';

/**
 * A finished workout the server refused, with why: Review reopens it in the logger to change and
 * finish again; Discard drops it after asking, since it never reached the server.
 */
export function RefusedSaveCard({
  save,
  onReview,
  onDiscard,
}: {
  save: RefusedSave;
  onReview: () => void;
  onDiscard: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const confirmDiscard = () =>
    Alert.alert(
      'Discard this workout?',
      save.resumed
        ? 'These changes have not synced and will be lost.'
        : 'This workout has not synced and will be lost.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Discard workout', style: 'destructive', onPress: onDiscard },
      ],
    );
  return (
    <View
      accessibilityLabel={`${save.name} not saved`}
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderRadius: radius.card, borderColor: colors.danger },
      ]}
    >
      <View style={styles.heading}>
        <Icon name="close" size={14} color={colors.danger} />
        <Text style={[type.callout, { color: colors.danger, fontWeight: '700' }]}>Not saved</Text>
        {save.durationMinutes ? (
          <Text style={[type.footnote, type.number, { color: colors.muted, marginLeft: 'auto' }]}>
            {formatMinutesDuration(save.durationMinutes)}
          </Text>
        ) : null}
      </View>
      <Text style={[type.headline, { color: colors.text }]} numberOfLines={1}>
        {save.name}
      </Text>
      <Text accessibilityRole="alert" style={[type.footnote, { color: colors.secondary }]}>
        {save.message}
      </Text>
      <View style={styles.actions}>
        <Button
          label="Discard"
          accessibilityLabel={`Discard ${save.name}`}
          variant="secondary"
          onPress={confirmDiscard}
          style={{ flex: 1 }}
        />
        <Button
          label="Review"
          accessibilityLabel={`Review ${save.name}`}
          onPress={onReview}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
