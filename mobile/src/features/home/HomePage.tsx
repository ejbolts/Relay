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
  const bottom = Platform.OS === 'ios' ? 0 : insets.bottom;
  const page = (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.page }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: space.gutter,
        // The date row is 44 pt tall for the Tips pill's touch box; take the extra out of the top
        // padding so the date sits where Screen puts its eyebrow.
        paddingTop: top + space.lg - EYEBROW_OVERHANG,
        gap: space.stack,
        // As Screen: iOS insets the scroll view itself; Android keeps the last card clear of the
        // gesture bar.
        paddingBottom: Math.max(space.xxl * 2, bottom + space.xl),
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
        {/* The title keeps its full width: when large text leaves no room beside it, the buttons
            wrap onto their own row, at the right, instead of cutting the title short. */}
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={[type.largeTitle, styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {!!actions && <View style={styles.actions}>{actions}</View>}
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

// Half of the 22 pt the date row grew by (44 pt touch box, 22 pt pill).
const EYEBROW_OVERHANG = 11;

const styles = StyleSheet.create({
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0 },
  pageHeader: { paddingHorizontal: 6, paddingBottom: 4 },
  // As tall as the Tips pill's touch box, so the date line doesn't jump when tips are turned off,
  // and the box ends where the header buttons begin.
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  eyebrow: { flex: 1, fontWeight: '500' },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 4,
  },
  // Grows to push the buttons right, but never shrinks below its own width.
  title: { flexGrow: 1, flexShrink: 0, maxWidth: '100%' },
  actions: { marginLeft: 'auto' },
});
