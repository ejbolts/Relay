import { Redirect, Stack } from 'expo-router';
import { useNavigationState, useRoute } from 'expo-router/react-navigation';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { useUser } from '../../session/SessionProvider';
import { headerOptions } from '../../ui/navigation';
import { useTheme } from '../../ui/theme';

/**
 * The admin console, pushed over Settings: the console, one account, and the server's details.
 * An account can open first, from a request notice, and the first screen gets a back button out.
 * Only administrators get the stack: anyone else, by a link or after losing the role, goes to
 * Settings before any admin screen, query or activity subscription mounts.
 */
export default function AdminLayout() {
  const user = useUser();
  if (!user.is_admin) return <Redirect href="/settings" />;
  return <AdminStack />;
}

function AdminStack() {
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
      <Stack.Screen name="index" options={{ title: 'Admin', headerLargeTitle: true }} />
      <Stack.Screen name="account/[id]" options={{ title: '' }} />
      <Stack.Screen name="server" options={{ title: 'Server' }} />
      <Stack.Screen name="username/[id]" options={{ title: 'Change username' }} />
    </Stack>
  );
}
