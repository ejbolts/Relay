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
  const { colors, type, radius } = useTheme();
  const now = useNow(30_000);
  const ordered = byLiveActivity(friends, (friend) => friend.presence);
  const week = lastWeek(today);
  if (!ordered.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Friends"
      contentContainerStyle={styles.rail}
      style={styles.bleed}
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
              <Avatar person={friend} size={56} status={status} />
              {live && (
                <View
                  style={[
                    styles.live,
                    { backgroundColor: colors.accent, borderRadius: radius.pill },
                  ]}
                >
                  <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>
                    Live
                  </Text>
                </View>
              )}
            </View>
            <Text style={[type.footnote, { color: colors.text }]} numberOfLines={1}>
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
  bleed: { marginHorizontal: -16 },
  rail: { paddingHorizontal: 16, gap: 14 },
  person: { width: 64, alignItems: 'center', gap: 4 },
  live: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  week: { flexDirection: 'row', gap: 2 },
  day: { width: 5, height: 5, borderRadius: 2.5 },
});
