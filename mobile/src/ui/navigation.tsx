import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Palette } from './theme';

// The app's navigation chrome in one place, so every stack looks the same: native headers in the
// page's colours with the accent back button, and route sheets that are real native sheets.

/** A stack's header look: put it in a `<Stack screenOptions>`, or spread it into a screen's. */
export function headerOptions(colors: Palette, reducedMotion = false) {
  return {
    headerTintColor: colors.accentText,
    headerTitleStyle: { color: colors.text, fontWeight: '600' as const },
    headerLargeTitleStyle: { color: colors.text, fontWeight: '700' as const },
    headerStyle: { backgroundColor: colors.page },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: colors.page },
    ...(reducedMotion && { animation: 'none' as const }),
  };
}

/** A screen pushed over the tabs from the root stack, with its own native header and back. */
export function pushedScreenOptions(colors: Palette, title: string) {
  return { ...headerOptions(colors), headerShown: true, title };
}

/** Heights a route sheet can rest at, as fractions of the screen, or its content's height. */
export type SheetDetents = number[] | 'fitToContents';

/**
 * A route that opens as a sheet: on iOS a native form sheet (grabber, detents, swipe down to
 * close, Liquid Glass on iOS 26); on Android a transparent modal whose screen wraps its content
 * in `<SheetFrame>`, since a pushed form sheet there draws under the native tab bar.
 */
export function sheetScreenOptions({
  detents = 'fitToContents',
  reducedMotion = false,
}: { detents?: SheetDetents; reducedMotion?: boolean } = {}) {
  if (Platform.OS === 'ios') {
    return {
      presentation: 'formSheet' as const,
      sheetAllowedDetents: detents,
      sheetGrabberVisible: true,
      sheetCornerRadius: 28,
      ...(reducedMotion && { animation: 'none' as const }),
    };
  }
  return {
    presentation: 'transparentModal' as const,
    animation: reducedMotion ? ('none' as const) : ('fade' as const),
    contentStyle: { backgroundColor: 'transparent' },
  };
}

/**
 * The body of a route opened with `sheetScreenOptions`. iOS draws the sheet itself, so this only
 * paints the surface; Android gets the same bottom sheet drawn here, over a dimmed backdrop that
 * closes it when tapped.
 */
export function SheetFrame({ onClose, children }: { onClose?: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'ios')
    return <View style={{ flex: 1, backgroundColor: colors.surface }}>{children}</View>;
  return (
    <View style={styles.backdrop}>
      {/* Screen readers close with Back, so the backdrop stays hidden from them. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessible={false}
        onPress={onClose ?? (() => router.back())}
      />
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom,
            marginTop: insets.top + 48,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  card: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
});
