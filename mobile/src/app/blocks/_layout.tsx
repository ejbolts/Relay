import { Stack } from 'expo-router';
import { firstRouteHeaderLeft } from '../../features/settings/HeaderBack';
import { headerOptions } from '../../ui/navigation';
import { useTheme } from '../../ui/theme';

/**
 * Training blocks: the overview, the block form and a block's summary, pushed over the tabs from
 * Training or Home. Any of them can open first, and the first one gets a back button out.
 */
export default function BlocksLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        ...headerOptions(colors),
        headerLeft: firstRouteHeaderLeft,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Training blocks', headerLargeTitle: true }} />
      <Stack.Screen name="edit" options={{ title: 'New training block' }} />
      <Stack.Screen name="summary/[id]" options={{ title: '' }} />
    </Stack>
  );
}
