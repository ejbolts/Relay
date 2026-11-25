import { StyleSheet, Text, View } from 'react-native';
import type { AdminUser } from '../../../../frontend/src/types';
import { useTheme } from '../../ui/theme';

type Tone = 'plain' | 'accent' | 'danger' | 'request';

/** The web's account badges: Admin, You, Disabled, waiting requests and a temporary password. */
export function AccountTags({ account, isSelf }: { account: AdminUser; isSelf: boolean }) {
  const { colors, type } = useTheme();
  const tags: [string, Tone][] = [];
  if (account.is_admin) tags.push(['Admin', 'accent']);
  if (isSelf) tags.push(['You', 'plain']);
  if (account.disabled_at !== null) tags.push(['Disabled', 'danger']);
  if (account.password_reset_requested_at) tags.push(['Reset requested', 'request']);
  if (account.username_reminder_requested_at) tags.push(['Username requested', 'request']);
  if (account.must_change_password) tags.push(['Temporary password', 'plain']);
  if (!tags.length) return null;
  const tone = {
    plain: { color: colors.secondary, backgroundColor: colors.surface2 },
    accent: { color: colors.accentText, backgroundColor: colors.accentSoft },
    danger: { color: colors.danger, backgroundColor: colors.surface2 },
    request: { color: colors.gold, backgroundColor: colors.goldSoft },
  };
  return (
    <View style={styles.tags}>
      {tags.map(([label, kind]) => (
        <Text key={label} style={[type.caption, styles.tag, tone[kind]]}>
          {label}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '600',
  },
});
