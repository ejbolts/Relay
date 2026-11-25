import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatLiftBestSet,
  formatLiftEstimate,
  liftRankingName,
  liftRankingRowLabel,
} from '../../../../frontend/src/liftRanking';
import { waitingForNetwork } from '../../data/offline';
import { useWeightUnit } from '../../data/queries';
import { Card, CardHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { ProfilePhoto } from '../../ui/ProfilePhoto';
import { useTheme } from '../../ui/theme';
import { socialRoutes } from '../social/navigation';
import { useIsOnline, useLiftLeaderboard, useSharingPrivate } from './exerciseInfoQueries';
import { Divider } from './parts';

/**
 * One of your lifts, ranked against the friends who have logged it, matching the web's
 * LiftLeaderboardCard. Hidden while loading, offline, when sharing is off, when empty or when a
 * fetch/refetch fails.
 */
export function LiftLeaderboardCard({ exerciseId }: { exerciseId: string }) {
  const { colors, type } = useTheme();
  const unit = useWeightUnit();
  const router = useRouter();
  const online = useIsOnline();
  const sharingPrivate = useSharingPrivate(online);
  const query = useLiftLeaderboard(exerciseId, online && !sharingPrivate);
  const entries = query.data;

  if (!online || sharingPrivate || waitingForNetwork(query) || query.isError || !entries?.length) {
    return null;
  }

  return (
    <Card accessibilityLabel="Friends">
      <CardHeader title="Friends" detail="All-time est. 1RM" />
      <View>
        {entries.map((entry, index) => {
          const rank = index + 1;
          const name = liftRankingName(entry);
          const estimate = formatLiftEstimate(entry.best, unit);
          const bestSet = formatLiftBestSet(entry.best, unit);
          const showDivider = index > 0 && !entry.is_you && !entries[index - 1]?.is_you;
          const content = (
            <>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={[
                  styles.rank,
                  type.footnote,
                  type.number,
                  { color: index === 0 ? colors.gold : colors.muted },
                ]}
              >
                {rank}
              </Text>
              <ProfilePhoto user={{ ...entry.member, username: '' }} size={36} />
              <View style={styles.nameColumn}>
                <Text
                  style={[type.callout, { color: colors.text, fontWeight: '600' }]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                <Text
                  style={[type.caption, type.number, { color: colors.muted }]}
                  numberOfLines={1}
                >
                  {bestSet}
                </Text>
              </View>
              <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '700' }]}>
                {estimate}
              </Text>
              <View style={styles.chevronSlot}>
                {!entry.is_you && <Icon name="chevronRight" size={14} color={colors.muted} />}
              </View>
            </>
          );

          return (
            <View key={entry.member.id}>
              {showDivider && <Divider />}
              {entry.is_you ? (
                <View
                  accessible
                  accessibilityLabel={liftRankingRowLabel(entry, rank, unit, false)}
                  style={[styles.row, styles.youRow, { backgroundColor: colors.accentSoft }]}
                >
                  {content}
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={liftRankingRowLabel(entry, rank, unit, true)}
                  onPress={() => router.push(socialRoutes.profile(entry.member.id))}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}
                >
                  {content}
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
  },
  youRow: {
    marginHorizontal: -10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  rank: {
    width: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  nameColumn: {
    flex: 1,
    gap: 2,
  },
  chevronSlot: {
    width: 16,
    alignItems: 'flex-end',
  },
});
