import { useCanGoBack, useRouter } from 'expo-router';
import { Platform, Pressable } from 'react-native';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';

/**
 * Renders `HeaderBack` only on a stack's first screen (`canGoBack` is false inside its stack);
 * pushed screens return undefined so the native stack back button stays in charge.
 */
export function firstRouteHeaderLeft({ canGoBack }: { canGoBack?: boolean }) {
  return canGoBack ? undefined : <HeaderBack />;
}

/**
 * The back button for the first screen of a pushed stack (Settings, Your splits), whose own
 * stack has nothing to go back to: it returns to the screen that opened it.
 */
export function HeaderBack() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { colors } = useTheme();
  if (!canGoBack) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={10}
      onPress={() => router.back()}
      style={{
        minWidth: 44,
        minHeight: 44,
        justifyContent: 'center',
        paddingRight: Platform.OS === 'ios' ? 8 : 16,
      }}
    >
      <Icon
        name={Platform.OS === 'ios' ? 'chevronLeft' : { sf: 'chevron.left', md: 'arrow-back' }}
        size={Platform.OS === 'ios' ? 22 : 24}
        color={colors.accentText}
      />
    </Pressable>
  );
}
