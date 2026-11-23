import { Stack } from 'expo-router';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { useTheme } from '../../ui/theme';

/**
 * The admin console, pushed over Settings: the console, one account, and the server's details.
 * An account can open first, from a request notice, and the first screen gets a back button out.
 */
export default function AdminLayout() {
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
    </Stack>
  );
}
