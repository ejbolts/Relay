import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { haptics } from '../../ui/haptics';

/** Training's segmented control is the shared native one. */
export { Segmented } from '../../ui/controls';

/** A toggle pill, as the web's filter chips. */
export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  leading,
  trailing,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const { colors, radius, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.accentSoft : colors.surface2,
          borderColor: selected ? colors.accent : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {leading}
      <Text
        style={[
          type.footnote,
          {
            color: selected ? colors.accentText : colors.secondary,
            fontWeight: '600',
          },
        ]}
      >
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'gold' }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.badge,
        {
          borderRadius: radius.sm,
          backgroundColor: tone === 'gold' ? colors.goldSoft : colors.surface2,
        },
      ]}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.8,
          color: tone === 'gold' ? colors.gold : colors.muted,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/** A list's next page, as a button that turns into a spinner while it loads. */
export function MoreButton({
  label,
  loading,
  onPress,
}: {
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();
  if (loading)
    return (
      <View style={styles.more}>
        <ActivityIndicator accessibilityLabel="Loading" color={colors.accentText} />
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}
    >
      <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>{label}</Text>
      <Icon name="chevronDown" size={14} color={colors.accentText} />
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.line,
        marginLeft: inset,
      }}
    />
  );
}

/** A small label above a value, as the web's stat tiles. */
export function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[type.headline, type.number, { color: colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {!!detail && (
        <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={1}>
          {detail}
        </Text>
      )}
    </View>
  );
}

/** A status line in place of a list: loading, empty or failed. */
export function Note({ children, action }: { children: string; action?: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.note}>
      <Text style={[type.callout, { color: colors.secondary, textAlign: 'center' }]}>
        {children}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    borderWidth: 1,
  },
  badge: { paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'center' },
  more: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  stat: { flexBasis: '47%', flexGrow: 1, gap: 2 },
  note: { paddingVertical: 20, alignItems: 'center', gap: 12 },
});
