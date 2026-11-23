import { Redirect, Stack } from 'expo-router';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { useUser } from '../../session/SessionProvider';
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
  return (
    <Stack
      screenOptions={({ navigation, route }) => ({
        headerTintColor: colors.accentText,
        headerTitleStyle: { color: colors.text },
        headerLargeTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.page },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.page },
        headerLeft: navigation.getState().routes[0]?.key === route.key ? HeaderBack : undefined,
      })}
    >
      <Stack.Screen name="index" options={{ title: 'Admin', headerLargeTitle: true }} />
      <Stack.Screen name="account/[id]" options={{ title: '' }} />
      <Stack.Screen name="server" options={{ title: 'Server' }} />
      <Stack.Screen name="username/[id]" options={{ title: 'Change username' }} />
    </Stack>
  );
}
