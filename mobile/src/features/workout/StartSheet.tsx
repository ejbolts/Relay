import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUpNext } from '../../data/queries';
import { Icon, type IconName } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useWorkout, type StartChoice } from './WorkoutProvider';

interface Option {
  label: string;
  detail?: string;
  icon: IconName;
  choice: StartChoice;
}

/** The web's Start menu as a native sheet: Cardio, Up next (when there is one) and Empty. */
export function StartSheet() {
  const workout = useWorkout();
  const upNext = useUpNext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, type, radius } = useTheme();
  const options: Option[] = [{ label: 'Cardio', icon: 'cardio', choice: { kind: 'cardio' } }];
  if (upNext.template)
    options.push({
      label: 'Up next',
      detail: upNext.label ? `${upNext.label} day` : undefined,
      icon: 'next',
      choice: { kind: 'up-next' },
    });
  options.push({ label: 'Empty', icon: 'blank', choice: { kind: 'empty' } });

  const sheet = (
    <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
        Start a workout
      </Text>
      <View style={styles.row}>
        {options.map((option) => (
          <Pressable
            key={option.label}
            accessibilityRole="button"
            accessibilityLabel={option.detail ? `${option.label}: ${option.detail}` : option.label}
            onPress={() => workout.start(option.choice, { replace: true })}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: colors.surface2, borderRadius: radius.lg },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
              <Icon name={option.icon} size={22} color={colors.accentText} />
            </View>
            <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
              {option.label}
            </Text>
            {!!option.detail && (
              <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
                {option.detail}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
  if (Platform.OS === 'ios') return sheet;
  // Android draws the sheet itself over a dimmed backdrop; tapping the backdrop closes it.
  return (
    <View style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => router.back()}
      />
      <View
        style={[styles.card, { backgroundColor: colors.surface, paddingBottom: insets.bottom }]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
        {sheet}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  card: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  sheet: { padding: 20, paddingTop: 24, gap: 18, backgroundColor: 'transparent' },
  row: { flexDirection: 'row', gap: 12, paddingBottom: 12 },
  option: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 18, paddingHorizontal: 6 },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
