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
import { haptics } from './haptics';
import { Icon, type IconName, type IconPair } from './Icon';
import { useTheme, type Palette } from './theme';

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
  const bottom = Platform.OS === 'ios' ? 0 : insets.bottom;
  const page = (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.page }}
      contentInsetAdjustmentBehavior="automatic"
      // The web's page: a 14 pt gutter and 12 pt between cards.
      contentContainerStyle={{
        padding: space.gutter,
        paddingTop: top + space.lg,
        gap: space.stack,
        // iOS insets the scroll view itself; Android keeps the last card clear of the gesture bar.
        paddingBottom: Math.max(space.xxl * 2, bottom + space.xl),
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.muted}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface2}
          />
        ) : undefined
      }
    >
      <View style={styles.pageHeader}>
        {/* The full width, so header buttons never cut it short. */}
        {!!eyebrow && (
          <Text style={[type.footnote, styles.eyebrow, { color: colors.muted }]} numberOfLines={1}>
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

/** The web's card surface: border, radius and (in Stained dark) its lift. */
export function cardSurface(colors: Palette): ViewStyle {
  return {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    ...(colors.cardShadow && {
      boxShadow: `inset 0 1px 0 ${colors.accentText}1f, 0 6px 18px rgba(0,0,0,0.4)`,
    }),
  };
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
  const { colors, space } = useTheme();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[cardSurface(colors), { padding: space.lg, gap: space.md }, style]}
    >
      {children}
    </View>
  );
}

/**
 * A card's heading, as the web's .pulse-card-header: the title, and on the right either a short
 * muted detail ("3 this week", or a good-toned "Logged") or an action.
 */
export function CardHeader({
  title,
  action,
  detail,
  detailTone = 'muted',
}: {
  title: string;
  action?: ReactNode;
  detail?: string;
  detailTone?: 'muted' | 'good';
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.cardHeader}>
      <Text accessibilityRole="header" style={[type.cardTitle, { color: colors.text, flex: 1 }]}>
        {title}
      </Text>
      {!!detail && (
        <Text
          style={[
            type.caption,
            detailTone === 'good'
              ? { color: colors.good, fontWeight: '600' }
              : { color: colors.muted },
          ]}
        >
          {detail}
        </Text>
      )}
      {action}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'link' | 'danger' | 'danger-soft';
export type ButtonSize = 'small' | 'default' | 'large';

/** The colours of each of the web's button variants (buttons.css). */
export function buttonColors(colors: Palette, variant: ButtonVariant) {
  return {
    primary: { fill: colors.accent, ink: colors.onAccent, border: 'transparent' },
    secondary: { fill: colors.surface2, ink: colors.text, border: colors.lineStrong },
    tonal: { fill: colors.accentSoft, ink: colors.accentText, border: 'transparent' },
    link: { fill: 'transparent', ink: colors.accentText, border: 'transparent' },
    danger: { fill: colors.dangerFill, ink: colors.onAccent, border: 'transparent' },
    'danger-soft': {
      fill: `${hexOnly(colors.danger)}1a`,
      ink: colors.danger,
      border: `${hexOnly(colors.danger)}73`,
    },
  }[variant];
}

// Style keys that place a button among its neighbours. The rest (fill, border, radius, padding)
// change how it looks.
const LAYOUT_KEYS = new Set([
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'start',
  'end',
  'zIndex',
  'width',
  'minWidth',
  'maxWidth',
  'transform',
]);

/**
 * Splits a button's `style` for a button drawn inside a larger touch area: placement goes on the
 * touch area, looks (fill, border, radius, padding, height) on the visible face, so a caller's
 * colours and shape still show and its margins still place the whole button.
 */
export function splitStyle(style: StyleProp<ViewStyle>): { box: ViewStyle; face: ViewStyle } {
  const box: Record<string, unknown> = {};
  const face: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(StyleSheet.flatten(style) ?? {})) {
    (LAYOUT_KEYS.has(key) ? box : face)[key] = value;
  }
  return { box: box as ViewStyle, face: face as ViewStyle };
}

const hexOnly = (colour: string) => (colour.startsWith('#') ? colour.slice(0, 7) : colour);

const SIZES = {
  small: { minHeight: 36, radius: 10, padding: 12, font: 13 },
  default: { minHeight: 44, radius: 12, padding: 16, font: 15 },
  large: { minHeight: 48, radius: 14, padding: 16, font: 16 },
};

/**
 * The web's .pulse-button. Primary is the one main action on a surface; secondary is the default
 * look elsewhere; tonal a softer accent; danger-soft a reversible red. A small button draws at
 * 36 pt inside a 44 pt touch area, so its hit area never depends on the parent's bounds.
 */
export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  size = 'default',
  block,
  loading,
  disabled,
  align,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName | IconPair;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fill the row, as the web's .block. */
  block?: boolean;
  /** Shows a spinner in place of the icon and stops presses, for a save in flight. */
  loading?: boolean;
  disabled?: boolean;
  /**
   * Where the label sits in the button's box. Links start at the leading edge, as the web's text
   * links do; the other variants centre. Pass `'center'` for a link that should centre.
   */
  align?: 'start' | 'center';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { fill, ink, border } = buttonColors(colors, variant);
  const link = variant === 'link';
  const metrics = SIZES[size];
  const inactive = !!disabled || !!loading;
  const compact = size === 'small' && !link;
  const split = splitStyle(style);
  const start = (align ?? (link ? 'start' : 'center')) === 'start';
  const look = (pressed: boolean): StyleProp<ViewStyle> => [
    styles.button,
    {
      minHeight: metrics.minHeight,
      paddingHorizontal: metrics.padding,
      backgroundColor: fill,
      borderColor: border,
      borderRadius: metrics.radius,
    },
    link && styles.link,
    start && styles.start,
    pressed && !inactive && { opacity: 0.7, transform: [{ scale: 0.98 }] },
    disabled && { opacity: 0.45 },
  ];
  const content = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        icon && <Icon name={icon} size={size === 'small' ? 14 : 16} color={ink} />
      )}
      <Text style={{ color: ink, fontSize: metrics.font, fontWeight: '600' }}>{label}</Text>
    </>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={inactive}
      hitSlop={link ? 6 : undefined}
      onPress={() => {
        if (!link) haptics.tap();
        onPress();
      }}
      style={({ pressed }) =>
        compact
          ? [styles.touchArea, block && styles.block, split.box]
          : [look(pressed), block && styles.block, style]
      }
    >
      {({ pressed }) =>
        compact ? <View style={[look(pressed), split.face]}>{content}</View> : content
      }
    </Pressable>
  );
}

/**
 * A square icon button, as the web's .icon-button-pulse: 40 pt, drawn inside a 44 pt touch area.
 * Give it an `icon`, or `children` (such as a profile photo) to draw instead, and an optional
 * `badge` (a short count) in the web's red pill.
 */
export function IconButton({
  icon,
  children,
  badge,
  accessibilityLabel,
  onPress,
  accent,
  pressed: on,
  disabled,
  style,
}: {
  icon?: IconName | IconPair;
  children?: ReactNode;
  badge?: string | null;
  accessibilityLabel: string;
  onPress: () => void;
  /** The filled accent look, for a page's main action. */
  accent?: boolean;
  /** A toggle that is on (aria-pressed). */
  pressed?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, scheme } = useTheme();
  const ink = accent ? colors.onAccent : on ? colors.accentText : colors.secondary;
  // The web's outline is --p-line; light mode needs the stronger line to read on the page.
  const outline = scheme === 'light' ? colors.lineStrong : colors.line;
  const split = splitStyle(style);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, ...(on !== undefined && { selected: on }) }}
      disabled={disabled}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={[styles.iconTouch, split.box]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.iconButton,
            {
              backgroundColor: accent ? colors.accent : colors.surface,
              borderColor: accent ? 'transparent' : on ? colors.accent : outline,
            },
            split.face,
            pressed && { opacity: 0.7 },
            disabled && { opacity: 0.45 },
          ]}
        >
          {children ?? (icon && <Icon name={icon} size={18} color={ink} />)}
          {!!badge && (
            <View
              // White on the darker danger fill reads at over 5:1 in every theme.
              style={[
                styles.badge,
                { backgroundColor: colors.dangerFill, borderColor: colors.page },
              ]}
            >
              {/* Grows with larger text, up to 1.5×, so a count like 9+ isn't clipped. */}
              <Text style={styles.badgeText} maxFontSizeMultiplier={1.5}>
                {badge}
              </Text>
            </View>
          )}
        </View>
      )}
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
      <Text
        accessibilityRole="alert"
        style={[type.callout, { color: colors.secondary, textAlign: 'center' }]}
      >
        {message}
      </Text>
      <Button label="Try again" variant="secondary" size="small" onPress={onRetry} />
    </View>
  );
}

/**
 * Nothing here yet, as the web's .empty-state: a dashed outline, an accent icon badge, a short
 * title and an optional line and action.
 */
export function EmptyState({
  icon,
  title,
  message,
  action,
  style,
}: {
  icon?: IconName | IconPair;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void; icon?: IconName | IconPair };
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: colors.lineStrong }, style]}>
      {icon && (
        <View style={[styles.emptyBadge, { backgroundColor: colors.accentSoft }]}>
          <Icon name={icon} size={22} color={colors.accentText} />
        </View>
      )}
      <Text style={[type.cardTitle, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      {!!message && (
        <Text style={[type.footnote, { color: colors.muted, textAlign: 'center', lineHeight: 19 }]}>
          {message}
        </Text>
      )}
      {action && (
        <Button
          label={action.label}
          icon={action.icon}
          size="small"
          onPress={action.onPress}
          style={{ marginTop: 6 }}
        />
      )}
    </View>
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not reach Relay. Try again.';
}

const styles = StyleSheet.create({
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0 },
  // The web's .page-header: a little inset from the cards, with room below before the first.
  pageHeader: { paddingHorizontal: 6, paddingBottom: 4 },
  eyebrow: { fontWeight: '500', marginBottom: 2 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  link: { minHeight: 32, paddingHorizontal: 4, borderWidth: 0 },
  start: { justifyContent: 'flex-start' },
  touchArea: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  block: { alignSelf: 'stretch' },
  iconTouch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The web's .profile-request-badge.
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    minHeight: 18,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  center: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
  },
  emptyBadge: {
    width: 45,
    height: 45,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
