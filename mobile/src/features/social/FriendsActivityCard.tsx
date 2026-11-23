import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { friendSession, loggedTime, relativeDay } from '../../../../frontend/src/friendFeedData';
import {
  byLiveActivity,
  presenceStatus,
  workoutElapsed,
} from '../../../../frontend/src/presenceStatus';
import { localDate } from '../../../../frontend/src/utils';
import { Button, Card, CardHeader } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import { Avatar } from './Avatar';
import { socialRoutes, useSocialNavigation } from './navigation';
import { ReactionBar } from './ReactionBar';
import { sharingRequired } from './socialApi';
import { useFriendFeed } from './socialQueries';

/** Sessions the card shows at first, and how many more Show more adds, as the web's. */
const FIRST = 5;
const MORE = 3;

/**
 * Home's Recent Friends Activity card: each friend's latest session, with its reactions and
 * comments. Friends working out now come first, showing the workout in progress instead.
 */
export function FriendsActivityCard({ title = 'Recent Friends Activity' }: { title?: string }) {
  const { colors, type, radius } = useTheme();
  const router = useRouter();
  const nav = useSocialNavigation();
  const [limit, setLimit] = useState(FIRST);
  const query = useFriendFeed(limit);
  const now = useNow(30_000);
  const today = localDate();
  const locked = sharingRequired(query.error);
  const feed = query.data;
  const items = feed ? byLiveActivity(feed.items, (item) => item.friend.presence) : [];
  const line = (text: string, alert = false) => (
    <Text
      accessibilityRole={alert ? 'alert' : undefined}
      style={[type.callout, { color: colors.secondary }]}
    >
      {text}
    </Text>
  );
  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <Button
            label={locked ? 'Share' : 'See all'}
            variant="link"
            onPress={() => (locked ? nav.openSharing() : router.navigate(socialRoutes.tab))}
          />
        }
      />
      {locked
        ? line('Share your profile to add friends and react to their workouts here.')
        : !feed
          ? query.error
            ? line('Friends’ sessions could not be loaded.', true)
            : line('Loading your friends’ sessions…')
          : feed.items.length === 0
            ? line(
                feed.friends === 0
                  ? 'Add friends to see their latest workouts here.'
                  : 'Your friends have not logged a workout yet.',
              )
            : items.map((item, index) => {
                const session = friendSession(item.workout);
                const subject = `${item.friend.display_name}’s ${item.workout.name}`;
                const status = presenceStatus(item.friend.presence);
                const live = status?.kind === 'workout' ? status.workout : null;
                return (
                  <View
                    key={item.workout.id}
                    style={[
                      styles.item,
                      index > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.line,
                        paddingTop: 12,
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${item.friend.display_name}'s profile`}
                      onPress={() => nav.openProfile(item.friend)}
                      style={({ pressed }) => [styles.person, pressed && { opacity: 0.6 }]}
                    >
                      <Avatar person={item.friend} size={36} status={status} />
                      <Text
                        style={[type.callout, { color: colors.text, fontWeight: '700', flex: 1 }]}
                        numberOfLines={1}
                      >
                        {item.friend.display_name}
                      </Text>
                    </Pressable>
                    {live ? (
                      <View style={styles.live}>
                        <View
                          style={[
                            styles.kind,
                            { backgroundColor: colors.accent, borderRadius: radius.pill },
                          ]}
                        >
                          <Text
                            style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}
                          >
                            Live
                          </Text>
                        </View>
                        <Text
                          style={[type.callout, { color: colors.text, flex: 1 }]}
                          numberOfLines={1}
                        >
                          {live.name}
                        </Text>
                        <Text style={[type.footnote, { color: colors.accentText }]}>
                          {`Working out · ${workoutElapsed(live.started_at, now)}`}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${subject} workout`}
                          onPress={() =>
                            nav.openWorkout({
                              id: item.workout.id,
                              memberId: item.friend.id,
                              date: item.workout.workout_date,
                            })
                          }
                          style={({ pressed }) => [{ gap: 2 }, pressed && { opacity: 0.6 }]}
                        >
                          <Text style={[type.headline, { color: colors.text }]} numberOfLines={1}>
                            {session.name}
                          </Text>
                          <View style={styles.meta}>
                            <View
                              style={[
                                styles.kind,
                                {
                                  backgroundColor: session.cardio
                                    ? colors.goldSoft
                                    : colors.accentSoft,
                                  borderRadius: radius.pill,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  type.caption,
                                  {
                                    color: session.cardio ? colors.gold : colors.accentText,
                                    fontWeight: '700',
                                  },
                                ]}
                              >
                                {session.cardio ? 'Cardio' : 'Strength'}
                              </Text>
                            </View>
                            <Text
                              style={[type.footnote, { color: colors.secondary, flex: 1 }]}
                              numberOfLines={1}
                            >
                              {[
                                relativeDay(item.workout.workout_date, today),
                                loggedTime(item.workout.created_at),
                                session.detail,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </View>
                        </Pressable>
                        <ReactionBar
                          workoutId={item.workout.id}
                          subject={subject}
                          reactions={item.reactions}
                          onOpenPerson={nav.openProfile}
                          onOpenComments={() =>
                            nav.openWorkout({
                              id: item.workout.id,
                              memberId: item.friend.id,
                              date: item.workout.workout_date,
                              comments: true,
                            })
                          }
                        />
                      </>
                    )}
                  </View>
                );
              })}
      {feed && feed.items.length > 0 && feed.with_sessions > feed.items.length && (
        <Button
          label={query.isFetching && limit > feed.items.length ? 'Loading…' : 'Show more'}
          variant="secondary"
          disabled={query.isFetching}
          onPress={() => setLimit(feed.items.length + MORE)}
        />
      )}
      {feed &&
        query.error &&
        limit > FIRST &&
        line('Could not load more activity. Try again.', true)}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { gap: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kind: { paddingHorizontal: 8, paddingVertical: 2 },
});
