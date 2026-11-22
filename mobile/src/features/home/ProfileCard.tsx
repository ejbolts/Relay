import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  formatMemberSince,
  formatProfileTotal,
  profileInitial,
  SEX_LABELS,
} from '../../../../frontend/src/profileDisplay';
import { prSetCount } from '../../../../frontend/src/trainingSummary';
import type { User } from '../../../../frontend/src/types';
import { apiOrigin } from '../../data/api';
import { useDashboard, usePersonalRecords } from '../../data/queries';
import { sessionToken } from '../../data/session';
import { useUser } from '../../session/SessionProvider';
import { Card } from '../../ui/components';
import { Icon, type IconPair } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { homeIcons } from './homeIcons';

/** The signed-in account with its all-time totals, as Home's Profile section on the web. */
export function ProfileCard() {
  const { colors, type } = useTheme();
  const user = useUser();
  const dashboard = useDashboard();
  const records = usePersonalRecords();
  const data = dashboard.data;
  const prs = useMemo(() => (records.data ? prSetCount(records.data) : null), [records.data]);
  const memberSince = formatMemberSince(user.created_at, 'short');
  const name = user.display_name.trim() || user.username;
  const stats: { label: string; icon: IconPair; tint: string; value: number | null | undefined }[] =
    [
      {
        label: 'Workouts',
        icon: homeIcons.calendar,
        tint: colors.accentText,
        value: data?.history?.strength_workouts ?? data?.history?.total_workouts,
      },
      {
        label: 'Cardio',
        icon: homeIcons.heart,
        tint: colors.good,
        value: data?.total_cardio_sessions,
      },
      { label: 'PRs', icon: homeIcons.trophy, tint: colors.gold, value: data ? prs : null },
    ];
  return (
    <Card style={styles.card} accessibilityLabel="Profile">
      <Avatar user={user} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.nameRow}>
          <Text
            accessibilityRole="header"
            style={[type.headline, { color: colors.text, flexShrink: 1 }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          {(user.sex === 'male' || user.sex === 'female') && (
            <Text
              accessibilityLabel={SEX_LABELS[user.sex]}
              style={[
                type.callout,
                { color: user.sex === 'male' ? colors.accentText : colors.danger },
              ]}
            >
              {user.sex === 'male' ? '♂' : '♀'}
            </Text>
          )}
        </View>
        <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={1}>
          @{user.username}
          {memberSince && ` · since ${memberSince}`}
        </Text>
        <View style={{ marginTop: 8, gap: 8 }}>
          {stats.map((stat) => (
            <View
              key={stat.label}
              style={styles.stat}
              accessible
              accessibilityLabel={`${stat.label}: ${formatProfileTotal(stat.value)}`}
            >
              <View style={[styles.statIcon, { backgroundColor: colors.surface2 }]}>
                <Icon name={stat.icon} size={14} color={stat.tint} />
              </View>
              <Text style={[type.footnote, { color: colors.secondary, flex: 1 }]}>
                {stat.label}
              </Text>
              <Text style={[type.headline, type.number, { color: colors.text }]}>
                {formatProfileTotal(stat.value)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

/** The account's photo, read with the session token, or its initial without one. */
function Avatar({ user }: { user: Pick<User, 'display_name' | 'username' | 'profile_photo_url'> }) {
  const { colors } = useTheme();
  const url = user.profile_photo_url ?? null;
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(
    null,
  );
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!url || !apiOrigin) return;
    let cancelled = false;
    const origin = new URL(apiOrigin).origin;
    void sessionToken(origin)
      .then((token) => {
        if (cancelled || !token) return;
        setSource({
          uri: /^https?:/.test(url) ? url : origin + url,
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);
  const showPhoto = !!source && failed !== source.uri;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
    >
      {showPhoto ? (
        <Image
          source={source}
          style={styles.photo}
          onError={() => setFailed(source.uri)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={{ fontSize: 40, fontWeight: '700', color: colors.accentText }}>
          {profileInitial(user)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
});
