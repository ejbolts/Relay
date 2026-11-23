import { Stack } from 'expo-router';
import { useReduceMotion } from '../../features/settings/devicePreferences';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { useTheme } from '../../ui/theme';

/** The split library and editor: pushed over the tabs from Home or Settings. */
export default function SplitLayout() {
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
        options={{ title: 'Your splits', headerLargeTitle: true, headerLeft: HeaderBack }}
      />
      <Stack.Screen name="edit" options={{ title: 'Edit split' }} />
    </Stack>
  );
}
