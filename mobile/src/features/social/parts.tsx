import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SHARING_LOCKED } from '../../../../frontend/src/sharedProfileDisplay';
import { Button, Card } from '../../ui/components';
import { Icon, type IconPair } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { socialIcons } from './icons';

/** A compact pill button for rows: Add friend, Accept, Cancel. */
export function SmallButton({
  label,
  onPress,
  variant = 'secondary',
  busy = false,
  disabled = false,
  accessibilityLabel,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  icon?: IconPair;
}) {
  const { colors, radius, type } = useTheme();
  const primary = variant === 'primary';
  const ink = primary ? colors.onAccent : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      hitSlop={4}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.small,
        {
          backgroundColor: primary ? colors.accent : colors.surface2,
          borderRadius: radius.pill,
        },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.7 },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        icon && <Icon name={icon} size={14} color={ink} />
      )}
      <Text style={[type.footnote, { color: ink, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

/** A heading inside a card, with an optional count. */
export function GroupTitle({ title, count }: { title: string; count?: number }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.groupTitle}>
      <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
        {title}
      </Text>
      {count !== undefined && (
        <Text style={[type.footnote, type.number, { color: colors.muted, fontWeight: '600' }]}>
          {count}
        </Text>
      )}
    </View>
  );
}

/** A person in a list: photo, name and a detail line, opening their profile. */
export function PersonRow({
  person,
  detail,
  onOpen,
  actions,
  status,
}: {
  person: { display_name: string; profile_photo_url?: string | null };
  detail?: string;
  onOpen?: () => void;
  actions?: ReactNode;
  status?: Parameters<typeof Avatar>[0]['status'];
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.personRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          onOpen ? `Open ${person.display_name}'s profile${detail ? `, ${detail}` : ''}` : undefined
        }
        disabled={!onOpen}
        onPress={onOpen}
        style={({ pressed }) => [styles.personOpen, pressed && { opacity: 0.6 }]}
      >
        <Avatar person={person} size={40} status={status} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.body, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
            {person.display_name}
          </Text>
          {!!detail && (
            <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={1}>
              {detail}
            </Text>
          )}
        </View>
        {onOpen && !actions && <Icon name="chevronRight" size={14} color={colors.muted} />}
      </Pressable>
      {actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

/** Social needs a shared profile: a private one can't see or add others. */
export function SharingLocked({
  onChooseSharing,
  title = SHARING_LOCKED.title,
}: {
  onChooseSharing: () => void;
  title?: string;
}) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <View style={styles.lockedHead}>
        <Icon name={socialIcons.lock} size={18} color={colors.accentText} />
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text, flex: 1 }]}>
          {title}
        </Text>
      </View>
      <Text style={[type.callout, { color: colors.secondary }]}>{SHARING_LOCKED.body}</Text>
      <Button label={SHARING_LOCKED.action} onPress={onChooseSharing} />
    </Card>
  );
}

/** A centred line, such as an empty list. */
export function EmptyLine({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.callout, { color: colors.secondary }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  small: {
    minHeight: 32,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  groupTitle: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  personOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockedHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
