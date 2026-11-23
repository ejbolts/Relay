import { Stack } from 'expo-router';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { PromptHost } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';

/** The split library and editor: pushed over the tabs from Home or Settings. */
export default function SplitLayout() {
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
          options={{ title: 'Your splits', headerLargeTitle: true, headerLeft: HeaderBack }}
        />
        <Stack.Screen name="edit" options={{ title: 'Edit split' }} />
      </Stack>
      <PromptHost />
    </>
  );
}
