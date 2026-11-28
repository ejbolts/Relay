import { Stack } from 'expo-router';
import { useNavigationState, useRoute } from 'expo-router/react-navigation';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { headerOptions } from '../../ui/navigation';
import { useTheme } from '../../ui/theme';

/**
 * Training blocks: the overview, the block form and a block's summary, pushed over the tabs from
 * Training or Home. Any of them can open first, and the first one gets a back button out.
 */
export default function BlocksLayout() {
  const { colors } = useTheme();
  // This stack's first screen, from the state its parent renders with: navigation.getState()
  // while rendering can be stale, and canGoBack counts the stacks underneath. Until the stack has
  // reported its state, its screens are the ones it opened with.
  const { key } = useRoute();
  const first = useNavigationState(
    (state) => state.routes.find((route) => route.key === key)?.state?.routes[0]?.key,
  );
  return (
    <Stack
      screenOptions={({ route }) => ({
        ...headerOptions(colors),
        headerLeft: (first ?? route.key) === route.key ? HeaderBack : undefined,
      })}
    >
      <Stack.Screen name="index" options={{ title: 'Training blocks', headerLargeTitle: true }} />
      <Stack.Screen name="edit" options={{ title: 'New training block' }} />
      <Stack.Screen name="summary/[id]" options={{ title: '' }} />
    </Stack>
  );
}
