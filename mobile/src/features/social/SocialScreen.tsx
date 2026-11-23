import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FriendActivity, TimelineItem } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, ErrorState, errorMessage, Loading, Screen } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { Segmented } from '../training/parts';
import { Avatar } from './Avatar';
import { FeedCard } from './FeedCard';
import { FriendQrSheet } from './FriendQrSheet';
import { FriendsRail } from './FriendsRail';
import { BlockedGroup, FriendsSection } from './FriendsSection';
import { socialIcons } from './icons';
import { useSocialNavigation } from './navigation';
import { EmptyLine, SharingLocked } from './parts';
import { sharingRequired } from './socialApi';
import { useFriendConnections, useTimeline } from './socialQueries';

type Section = 'feed' | 'friends';

/**
 * Social, as the web's: the Feed of your and your friends' workouts, and Friends, with requests,
 * search, suggestions and blocks. Your QR code and your profile sit in the header.
 */
export function SocialScreen() {
  const { colors } = useTheme();
  const user = useUser();
  const nav = useSocialNavigation();
  const [section, setSection] = useState<Section>('feed');
  const [qrOpen, setQrOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const friends = useFriendConnections();
  const timeline = useTimeline();
  const connections = friends.data;
  const locked =
    !!connections?.locked || sharingRequired(friends.error) || sharingRequired(timeline.error);
  const requests = connections?.requests.length ?? 0;
  const count = connections?.friends.length;

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([friends.refetch(), timeline.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <Screen
        title="Social"
        eyebrow={count === undefined ? undefined : `${count} ${count === 1 ? 'friend' : 'friends'}`}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        actions={
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="QR code"
              hitSlop={6}
              onPress={() => setQrOpen(true)}
              style={({ pressed }) => [
                styles.round,
                { backgroundColor: colors.surface2 },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Icon name={socialIcons.qr} size={18} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your profile"
              hitSlop={6}
              onPress={() => nav.openProfile(user)}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Avatar person={user} size={36} />
            </Pressable>
          </View>
        }
      >
        <Segmented
          accessibilityLabel="Social sections"
          values={[
            'Feed',
            requests > 0 ? `Friends (${requests > 9 ? '9+' : requests})` : 'Friends',
          ]}
          selectedIndex={section === 'feed' ? 0 : 1}
          onChange={(index) => setSection(index === 0 ? 'feed' : 'friends')}
        />
        {locked ? (
          <>
            <SharingLocked onChooseSharing={nav.openSharing} />
            {section === 'friends' && !!connections?.blocked.length && (
              <BlockedGroup blocked={connections.blocked} />
            )}
          </>
        ) : section === 'feed' ? (
          <Feed
            items={timeline.data}
            friends={connections?.friends ?? null}
            pending={timeline.isPending}
            error={timeline.error}
            hasMore={timeline.hasNextPage}
            loadingMore={timeline.isFetchingNextPage}
            onLoadMore={() => void timeline.fetchNextPage()}
            onRetry={() => void timeline.refetch()}
            onFindFriends={() => setSection('friends')}
          />
        ) : connections ? (
          <FriendsSection connections={connections} />
        ) : friends.error ? (
          <ErrorState
            message={errorMessage(friends.error)}
            onRetry={() => void friends.refetch()}
          />
        ) : (
          <Loading label="Loading your friends" />
        )}
      </Screen>
      <FriendQrSheet
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        onChooseSharing={nav.openSharing}
        onScanned={nav.openInvite}
      />
    </>
  );
}

function Feed({
  items,
  friends,
  pending,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
  onRetry,
  onFindFriends,
}: {
  items: TimelineItem[] | undefined;
  friends: FriendActivity[] | null;
  pending: boolean;
  error: Error | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onFindFriends: () => void;
}) {
  const { colors, type } = useTheme();
  const nav = useSocialNavigation();
  const today = localDate();
  if (!items) {
    return pending ? (
      <Loading label="Loading the feed" />
    ) : (
      <ErrorState message={errorMessage(error)} onRetry={onRetry} />
    );
  }
  return (
    <>
      <FriendsRail friends={friends ?? []} today={today} onOpenFriend={nav.openProfile} />
      {items.length === 0 ? (
        <Card>
          <EmptyLine>
            {friends && friends.length > 0
              ? 'No workouts here yet. Sessions you and your friends log appear in this feed.'
              : 'Add friends to see their workouts and photos here.'}
          </EmptyLine>
          {friends?.length === 0 && (
            <Button label="Find friends" icon="search" onPress={onFindFriends} />
          )}
        </Card>
      ) : (
        items.map((item) => <FeedCard key={item.workout.id} item={item} today={today} />)
      )}
      {error && (
        <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
          {errorMessage(error)}
        </Text>
      )}
      {hasMore && (
        <Button
          label={loadingMore ? 'Loading…' : 'Show older workouts'}
          variant="secondary"
          disabled={loadingMore}
          onPress={onLoadMore}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
