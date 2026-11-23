import { Stack } from 'expo-router';
import { useReduceMotion } from '../../features/settings/devicePreferences';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { useTheme } from '../../ui/theme';

/** Settings' own stack, pushed over the tabs, with native headers and back buttons. */
export default function SettingsLayout() {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.accentText,
        headerTitleStyle: { color: colors.text },
        headerLargeTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.page },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.page },
        ...(reduced && { animation: 'none' }),
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Settings', headerLargeTitle: true, headerLeft: HeaderBack }}
      />
      <Stack.Screen name="profile" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="password" options={{ title: 'Change password' }} />
      <Stack.Screen name="workout-types" options={{ title: 'Workout types' }} />
      <Stack.Screen name="whats-new" options={{ title: "What's new" }} />
      {/* Settings and account */}
      <Stack.Screen name="appearance" options={{ title: 'Theme and motion' }} />
      <Stack.Screen name="fresh-starts" options={{ title: 'Fresh starts' }} />
      <Stack.Screen name="bodyweight" options={{ title: 'Bodyweight chart' }} />
      <Stack.Screen name="type-exercises" options={{ title: 'Workout type exercises' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
      <Stack.Screen name="feedback" options={{ title: 'Send feedback' }} />
      <Stack.Screen name="tips" options={{ title: 'Tips' }} />
    </Stack>
  );
}
