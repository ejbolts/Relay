import { NativeTabs } from 'expo-router/native-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useElapsed } from './useElapsed';
import { useWorkout, type LiveWorkout } from './WorkoutProvider';

/**
 * The minimised workout in the tab bar's accessory (iOS 26+), like a music mini-player: its name
 * and time, and a tap reopens the logger.
 */
export function LiveWorkoutAccessory() {
  const { live, open } = useWorkout();
  if (!live) return null;
  return <Accessory live={live} onPress={open} />;
}

function Accessory({ live, onPress }: { live: LiveWorkout; onPress: () => void }) {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const { colors, type } = useTheme();
  const elapsed = useElapsed(live.startedAt, live.pause);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${live.name}, ${elapsed}`}
      onPress={onPress}
      style={styles.row}
    >
      <Icon name="timer" size={18} color={colors.accentText} />
      <View style={{ flex: 1 }}>
        <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
          {live.name}
        </Text>
      </View>
      {placement === 'regular' && (
        <Text style={[type.callout, type.number, { color: colors.secondary }]}>{elapsed}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
});
