import { Stack } from 'expo-router';
import { useReduceMotion } from '../../features/settings/devicePreferences';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { useTheme } from '../../ui/theme';

/**
 * Imports and exports (mobile batch 4, data stream), pushed over the tabs from Settings' Data
 * section. Any of them can open first, and the first one gets a back button out.
 */
export default function DataLayout() {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  return (
    <Stack
      screenOptions={({ navigation, route }) => ({
        headerTintColor: colors.accentText,
        headerTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.page },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.page },
        headerLeft: navigation.getState().routes[0]?.key === route.key ? HeaderBack : undefined,
        ...(reduced && { animation: 'none' }),
      })}
    >
      <Stack.Screen name="import" options={{ title: 'Import workouts' }} />
      <Stack.Screen name="import-review" options={{ title: 'Review import' }} />
      <Stack.Screen name="import-mapping" options={{ title: 'Map exercise' }} />
      <Stack.Screen name="import-history" options={{ title: 'Import history' }} />
      <Stack.Screen name="export" options={{ title: 'Export data' }} />
    </Stack>
  );
}
