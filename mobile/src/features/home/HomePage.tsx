import type { ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../ui/theme';

/**
 * Home's page: the shared `Screen` layout, plus a slot at the end of the date line for the tips
 * pill, as the web's `.page-eyebrow-row`. (`Screen` takes the eyebrow as text only; if it gains an
 * eyebrow accessory, Home can go back to it.)
 */
export function HomePage({
  title,
  eyebrow,
  eyebrowAccessory,
  actions,
  refreshing,
  onRefresh,
  children,
}: {
  title: string;
  eyebrow: string;
  eyebrowAccessory?: ReactNode;
  actions?: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const { colors, space, type } = useTheme();
  // iOS insets the first scroll view in a native tab itself; Android needs the status bar room.
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'ios' ? 0 : insets.top;
  const page = (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.page }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: space.gutter,
        paddingTop: top + space.lg,
        gap: space.stack,
        paddingBottom: space.xxl * 2,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.muted}
          colors={[colors.accent]}
          progressBackgroundColor={colors.surface2}
        />
      }
    >
      <View style={styles.pageHeader}>
        <View style={styles.eyebrowRow}>
          <Text style={[type.footnote, styles.eyebrow, { color: colors.muted }]} numberOfLines={1}>
            {eyebrow}
          </Text>
          {eyebrowAccessory}
        </View>
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={[type.largeTitle, { color: colors.text, flex: 1 }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {actions}
        </View>
      </View>
      {children}
    </ScrollView>
  );
  if (Platform.OS === 'ios') return page;
  // Android draws edge to edge under a transparent status bar: keep a page-coloured band behind
  // it so scrolled content doesn't run under the clock and icons.
  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      {page}
      <View
        pointerEvents="none"
        style={[styles.statusBand, { height: insets.top, backgroundColor: colors.page }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0 },
  pageHeader: { paddingHorizontal: 6, paddingBottom: 4 },
  // As tall as the tips pill, so the date line doesn't jump when tips are turned off.
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 22,
    marginBottom: 6,
  },
  eyebrow: { flex: 1, fontWeight: '500' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
