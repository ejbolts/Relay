import { Stack } from 'expo-router';
import { useReduceMotion } from '../../features/settings/devicePreferences';
import { HeaderBack } from '../../features/settings/HeaderBack';
import { headerOptions } from '../../ui/navigation';
import { useTheme } from '../../ui/theme';

/** The split library and editor: pushed over the tabs from Home or Settings. */
export default function SplitLayout() {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  return (
    <Stack screenOptions={headerOptions(colors, reduced)}>
      <Stack.Screen
        name="index"
        options={{ title: 'Your splits', headerLargeTitle: true, headerLeft: HeaderBack }}
      />
      <Stack.Screen name="edit" options={{ title: 'Edit split' }} />
    </Stack>
  );
}
