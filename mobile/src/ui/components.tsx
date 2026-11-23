import * as Haptics from 'expo-haptics';
import type { ComponentRef, ReactNode, Ref } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName, type IconPair } from './Icon';
import { useTheme } from './theme';

/**
 * A tab's scrolling page with a large title, like the web's page headers. On iOS the scroll view
 * is the first one in a native tab, so it scrolls under the translucent tab bar automatically.
 */
export function Screen({
  title,
  eyebrow,
  actions,
  refreshing,
  onRefresh,
  scrollRef,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** For a screen that scrolls to something itself, such as Social revealing a workout. */
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
  children: ReactNode;
}) {
  const { colors, space, type } = useTheme();
  // iOS insets the first scroll view in a native tab itself; Android needs the status bar room.
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'ios' ? 0 : insets.top;
  const page = (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.page }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: space.lg,
        paddingTop: top + space.lg,
        gap: space.lg,
        paddingBottom: space.xxl * 2,
      }}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      <View>
        {/* The full width, so header buttons never cut it short. */}
        {!!eyebrow && (
          <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={1}>
            {eyebrow}
          </Text>
        )}
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={[type.largeTitle, { color: colors.text, flex: 1 }]}
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

export function Card({
  children,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors, radius, space } = useTheme();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderColor: colors.line,
          borderWidth: StyleSheet.hairlineWidth,
          padding: space.lg,
          gap: space.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.cardHeader}>
      <Text accessibilityRole="header" style={[type.headline, { color: colors.text, flex: 1 }]}>
        {title}
      </Text>
      {action}
    </View>
  );
}

type Variant = 'primary' | 'secondary' | 'link' | 'danger';

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName | IconPair;
  variant?: Variant;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, type } = useTheme();
  const fill = {
    primary: colors.accent,
    secondary: colors.surface2,
    link: 'transparent',
    danger: colors.dangerFill,
  }[variant];
  const ink = {
    primary: colors.onAccent,
    secondary: colors.text,
    link: colors.accentText,
    danger: colors.onAccent,
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        if (variant !== 'link') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: fill, borderRadius: radius.md },
        variant === 'link' && styles.link,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.7 },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={16} color={ink} />}
      <Text style={[type.callout, { color: ink, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

export function Loading({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator accessibilityLabel={label} color={colors.accentText} />
    </View>
  );
}

/** A failed load, with the reason and a way to try again. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors, type } = useTheme();
  return (
    <View style={[styles.center, { gap: 12 }]}>
      <Text accessibilityRole="alert" style={[type.callout, { color: colors.secondary }]}>
        {message}
      </Text>
      <Button label="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not reach Relay. Try again.';
}

const styles = StyleSheet.create({
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: {
    minHeight: 46,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  link: { minHeight: 32, paddingHorizontal: 4 },
  center: { padding: 24, alignItems: 'center', justifyContent: 'center' },
});
