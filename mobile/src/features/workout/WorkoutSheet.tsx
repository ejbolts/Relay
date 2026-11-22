import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useElapsed } from './useElapsed';
import { useWorkout, type LiveWorkout } from './WorkoutProvider';

/** Placeholder logger: the workout's name and time. The logger PR replaces this screen. */
export function WorkoutSheet() {
  const { live } = useWorkout();
  const { colors } = useTheme();
  return (
    <View style={[styles.page, { backgroundColor: colors.page }]}>
      {live ? <Live live={live} /> : null}
    </View>
  );
}

function Live({ live }: { live: LiveWorkout }) {
  const router = useRouter();
  const { discard } = useWorkout();
  const { colors, type } = useTheme();
  const elapsed = useElapsed(live.startedAt);
  return (
    <>
      <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
        {live.name}
      </Text>
      <Text style={[type.headline, type.number, { color: colors.secondary }]}>{elapsed}</Text>
      <Button label="Minimise" variant="secondary" onPress={() => router.back()} />
      <Button
        label="Discard workout"
        variant="danger"
        onPress={() => {
          discard();
          router.back();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, padding: 20, gap: 14 } });
