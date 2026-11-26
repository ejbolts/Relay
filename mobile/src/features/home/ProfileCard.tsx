import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatMemberSince,
  formatProfileTotal,
  SEX_LABELS,
} from '../../../../frontend/src/profileDisplay';
import { prSetCount } from '../../../../frontend/src/trainingSummary';
import { useDashboard, usePersonalRecords } from '../../data/queries';
import { useUser } from '../../session/SessionProvider';
import { Card } from '../../ui/components';
import { Icon, type IconPair } from '../../ui/Icon';
import { ProfilePhoto } from '../../ui/ProfilePhoto';
import { useTheme } from '../../ui/theme';
import { socialRoutes } from '../social';
import { homeIcons } from './homeIcons';

/** The signed-in account with its all-time totals, as Home's Profile section on the web. */
export function ProfileCard() {
  const { colors, type } = useTheme();
  const router = useRouter();
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        onPress={() => router.push(socialRoutes.profile(user.id))}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        <ProfilePhoto user={user} size={104} />
      </Pressable>
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
});
