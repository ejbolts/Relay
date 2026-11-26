import { Stack } from 'expo-router';
import { useReduceMotion } from '../../features/settings/devicePreferences';
import { useNavigationState, useRoute } from 'expo-router/react-navigation';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { headerOptions } from '../../ui/navigation';
import { useTheme } from '../../ui/theme';

/**
 * Imports and exports (mobile batch 4, data stream), pushed over the tabs from Settings' Data
 * section. Any of them can open first, and the first one gets a back button out.
 */
export default function DataLayout() {
  const { colors } = useTheme();
  // This stack's first screen, from the state its parent renders with: navigation.getState()
  // while rendering can be stale, and canGoBack counts the stacks underneath. Until the stack has
  // reported its state, its screens are the ones it opened with.
  const { key } = useRoute();
  const first = useNavigationState(
    (state) => state.routes.find((route) => route.key === key)?.state?.routes[0]?.key,
  );
  const reduced = useReduceMotion();
  return (
    <Stack
      screenOptions={({ route }) => ({
        ...headerOptions(colors, reduced),
        headerLeft: (first ?? route.key) === route.key ? HeaderBack : undefined,
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
