import { Stack } from 'expo-router';
import { useTheme } from '../../../ui/theme';

/** Training's own stack, so an exercise or a session opens on top of the tab. */
export default function TrainingLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.accentText,
        headerTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.page },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.page },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Training' }} />
      <Stack.Screen name="exercise/[id]" options={{ title: '' }} />
      <Stack.Screen name="session/[id]" options={{ title: 'Workout' }} />
    </Stack>
  );
}
