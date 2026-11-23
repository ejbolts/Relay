import { Stack } from 'expo-router';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { PromptHost } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';

/** Settings' own stack, pushed over the tabs, with native headers and back buttons. */
export default function SettingsLayout() {
  const { colors } = useTheme();
  return (
    <>
      <Stack
        screenOptions={{
          headerTintColor: colors.accentText,
          headerTitleStyle: { color: colors.text },
          headerLargeTitleStyle: { color: colors.text },
          headerStyle: { backgroundColor: colors.page },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.page },
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
      </Stack>
      <PromptHost />
    </>
  );
}
