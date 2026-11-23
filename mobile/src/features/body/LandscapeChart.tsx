import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { bodyIcons } from './bodyIcons';

/** The bordered square button that opens a chart full screen in landscape, as on the web. */
export function LandscapeButton({ title, onPress }: { title: string; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${title} full screen in landscape`}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.toggleTarget, pressed && { opacity: 0.65 }]}
    >
      <View
        style={[
          styles.toggle,
          {
            backgroundColor: colors.surface2,
            borderColor: colors.lineStrong,
            borderRadius: radius.sm,
          },
        ]}
      >
        <Icon name={bodyIcons.expand} size={18} color={colors.accentText} />
      </View>
    </Pressable>
  );
}

/**
 * A chart full screen, turned to landscape while it is open (the web's LandscapeChartFrame).
 * The screen rotates back when it closes. `children` draws the chart at the space it has.
 */
export function LandscapeChartView({
  title,
  visible,
  onClose,
  header,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  /** Controls beside the title, such as the timeline's year. */
  header?: ReactNode;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const { colors, type } = useTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!visible) return;
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(
      () => undefined,
    );
    return () => {
      void ScreenOrientation.unlockAsync().catch(() => undefined);
    };
  }, [visible]);
  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* A modal is a separate native window, so its gestures need their own root. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={[styles.page, { backgroundColor: colors.page }]}>
          <View style={styles.bar}>
            <Text
              accessibilityRole="header"
              style={[type.headline, { color: colors.text, flex: 1 }]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {header}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Exit full-screen ${title}`}
              hitSlop={10}
              onPress={() => {
                haptics.tap();
                onClose();
              }}
              style={({ pressed }) => [styles.exit, pressed && { opacity: 0.6 }]}
            >
              <Icon name="close" size={14} color={colors.accentText} />
              <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>
                Exit
              </Text>
            </Pressable>
          </View>
          <View
            style={{ flex: 1 }}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setSize({ width, height });
            }}
          >
            {size && size.width > 0 && children(size)}
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // A 44 pt target around the web's 36 pt bordered square.
  toggleTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  toggle: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: { flex: 1, paddingHorizontal: 16, paddingBottom: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  exit: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
});
