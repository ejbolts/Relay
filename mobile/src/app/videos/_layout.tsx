import { Stack } from 'expo-router';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { useTheme } from '../../ui/theme';

/** The videos tab, pushed over the tabs with its own header and a back button out. */
export default function VideosLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Videos', headerLeft: HeaderBack }} />
    </Stack>
  );
}
