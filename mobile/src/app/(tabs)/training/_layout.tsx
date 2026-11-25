import { Stack } from 'expo-router';
import { headerOptions } from '../../../ui/navigation';
import { useTheme } from '../../../ui/theme';

/** Keeps Training's root under screens pushed from outside the tab (guides, Home, Social). */
export const unstable_settings = { anchor: 'index' };

/** Training's own stack, so an exercise or a session opens on top of the tab. */
export default function TrainingLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={headerOptions(colors)}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Training' }} />
      <Stack.Screen name="exercise/[id]" options={{ title: '' }} />
      <Stack.Screen name="session/[id]" options={{ title: 'Workout' }} />
      {/* Exercise library management (mobile batch 3, exercises and blocks stream). */}
      <Stack.Screen name="exercise-edit/[id]" options={{ title: 'Edit exercise' }} />
      <Stack.Screen name="exercise-merge" options={{ title: 'Merge exercises' }} />
      <Stack.Screen name="machine-weights/[id]" options={{ title: 'Machine weights' }} />
    </Stack>
  );
}
