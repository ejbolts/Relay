import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { firstName, lastWeek } from '../../../../frontend/src/friendFeedData';
import {
  byLiveActivity,
  presenceStatus,
  presenceText,
  workoutElapsed,
} from '../../../../frontend/src/presenceStatus';
import type { FriendActivity } from '../../../../frontend/src/types';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import { Avatar } from './Avatar';

/**
 * The feed's row of friends: training now first, then online, with a dot for each of the last
 * seven days they trained. Each opens the friend's profile.
 */
export function FriendsRail({
  friends,
  today,
  onOpenFriend,
}: {
  friends: FriendActivity[];
  today: string;
  onOpenFriend: (friend: FriendActivity) => void;
}) {
  const { colors, space, type, radius } = useTheme();
  const now = useNow(30_000);
  const ordered = byLiveActivity(friends, (friend) => friend.presence);
  const week = lastWeek(today);
  if (!ordered.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Friends"
      contentContainerStyle={[styles.rail, { paddingHorizontal: space.gutter }]}
      style={{ marginHorizontal: -space.gutter }}
    >
      {ordered.map((friend) => {
        const status = presenceStatus(friend.presence);
        const live = status?.kind === 'workout' ? status.workout : null;
        const trained = new Set(friend.training_dates);
        const activeDays = week.filter((day) => trained.has(day)).length;
        const statusText = live
          ? `training now: ${live.name}, ${workoutElapsed(live.started_at, now)}`
          : presenceText(status, now);
        return (
          <Pressable
            key={friend.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${friend.display_name}'s profile${
              statusText ? `, ${statusText}` : ''
            }, trained on ${activeDays} of the last ${week.length} days`}
            onPress={() => onOpenFriend(friend)}
            style={({ pressed }) => [styles.person, pressed && { opacity: 0.6 }]}
          >
            <View>
              <View style={[styles.ring, { borderColor: live ? colors.accent : colors.line }]}>
                <Avatar person={friend} size={52} status={live ? null : status} />
              </View>
              {live && (
                <View
                  style={[
                    styles.live,
                    {
                      backgroundColor: colors.accent,
                      borderColor: colors.page,
                      borderRadius: radius.pill,
                    },
                  ]}
                >
                  <Text style={[styles.liveText, { color: colors.onAccent }]}>LIVE</Text>
                </View>
              )}
            </View>
            <Text style={[type.caption, styles.name, { color: colors.text }]} numberOfLines={1}>
              {firstName(friend.display_name)}
            </Text>
            <View style={styles.week}>
              {week.map((day) => (
                <View
                  key={day}
                  style={[
                    styles.day,
                    { backgroundColor: trained.has(day) ? colors.accent : colors.lineStrong },
                    day === today &&
                      !trained.has(day) && {
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderColor: colors.muted,
                      },
                  ]}
                />
              ))}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { gap: 4, paddingVertical: 2 },
  person: { width: 68, alignItems: 'center', gap: 5 },
  ring: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
  },
  live: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    borderWidth: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  liveText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  name: { fontWeight: '600' },
  week: { flexDirection: 'row', gap: 3 },
  day: { width: 5, height: 5, borderRadius: 2.5 },
});
