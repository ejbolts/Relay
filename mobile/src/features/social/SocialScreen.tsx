import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FriendActivity, TimelineItem } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { workoutFocusStep } from '../../../../frontend/src/workoutFocusRequest';
import { useUser } from '../../session/SessionProvider';
import { AccountHeaderActions } from '../../ui/AccountHeaderActions';
import { Button, EmptyState, ErrorState, errorMessage, Loading, Screen } from '../../ui/components';
import { Segmented } from '../../ui/controls';
import { useTheme } from '../../ui/theme';
import { CommentsSheet } from './Comments';
import { FeedCard } from './FeedCard';
import { FriendQrSheet } from './FriendQrSheet';
import { FriendsRail } from './FriendsRail';
import { BlockedGroup, FriendsSection } from './FriendsSection';
import { socialIcons } from './icons';
import { useSocialNavigation } from './navigation';
import { NotificationsBell } from './NotificationsBell';
import { SharingLocked } from './parts';
import { usePrefetchFriendProfiles } from './profilePrefetch';
import { ReactionPeopleSheet } from './ReactionBar';
import { sharingRequired } from './socialApi';
import { useFriendConnections, useTimeline } from './socialQueries';
import {
  clearWorkoutFocus,
  dismissWorkoutFocus,
  onWorkoutFocusRequested,
  showWorkoutFocus,
  useShownWorkoutFocus,
  useWorkoutFocus,
  type WorkoutFocus,
} from './workoutFocus';

type Section = 'feed' | 'friends';

/**
 * Social, as the web's: the Feed of your and your friends' workouts, and Friends, with requests,
 * search, suggestions and blocks. The notifications bell, your profile and Settings sit in the
 * header, matching every other tab. A workout opened from a notification is revealed in the feed.
 */
export function SocialScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useUser();
  const nav = useSocialNavigation();
  const focused = useIsFocused();
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
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const reveal = useFeedReveal(scroll);
  const shown = useShownWorkoutFocus();

  // A workout opened from a notification is shown in the feed.
  useEffect(() => onWorkoutFocusRequested(() => setSection('feed')), []);
  useFeedFocus({
    items: timeline.data,
    hasMore: timeline.hasNextPage,
    loadingMore: timeline.isFetchingNextPage,
    loadMore: timeline.fetchNextPage,
    locked,
    active: focused,
    onReveal: reveal.reveal,
  });
  usePrefetchFriendProfiles(connections?.friends ?? null, focused && section === 'feed' && !locked);

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
        scrollRef={scroll}
        actions={
          <AccountHeaderActions
            notifications={<NotificationsBell />}
            profile={{ user, onPress: () => nav.openProfile(user) }}
            onSettings={() => router.push('/settings')}
          />
        }
      >
        <View style={styles.segmentWrap}>
          <Segmented
            accessibilityLabel={
              requests > 0
                ? `Social sections, ${requests} friend ${requests === 1 ? 'request' : 'requests'}`
                : 'Social sections'
            }
            values={['Feed', 'Friends']}
            selectedIndex={section === 'feed' ? 0 : 1}
            onChange={(index) => setSection(index === 0 ? 'feed' : 'friends')}
          />
          {requests > 0 && (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.requestBadge,
                { backgroundColor: colors.danger, borderColor: colors.page },
              ]}
            >
              <Text style={styles.requestBadgeText}>{requests > 9 ? '9+' : requests}</Text>
            </View>
          )}
        </View>
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
            onCardLayout={reveal.onCardLayout}
          />
        ) : connections ? (
          <FriendsSection connections={connections} onOpenQr={() => setQrOpen(true)} />
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
      {shown?.mode === 'detached' && shown.panel === 'people' && (
        <ReactionPeopleSheet
          workoutId={shown.workoutId}
          highlightPersonId={shown.personId}
          onClose={() => dismissWorkoutFocus(shown.key)}
          onOpenPerson={(person) => {
            dismissWorkoutFocus(shown.key);
            nav.openProfile(person);
          }}
        />
      )}
      {shown?.mode === 'detached' && shown.panel === 'comments' && (
        <CommentsSheet
          workoutId={shown.workoutId}
          title={shown.workoutName}
          highlightId={shown.commentId}
          onClose={() => dismissWorkoutFocus(shown.key)}
          onOpenPerson={(person) => {
            dismissWorkoutFocus(shown.key);
            nav.openProfile(person);
          }}
        />
      )}
    </>
  );
}

/**
 * Finds a workout opened from a notification in the feed, loading older pages as the web does,
 * then reveals its card or, when it's further back, opens its reactions or comments on their own.
 */
function useFeedFocus({
  items,
  hasMore,
  loadingMore,
  loadMore,
  locked,
  active,
  onReveal,
}: {
  items: TimelineItem[] | undefined;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => unknown;
  locked: boolean;
  active: boolean;
  onReveal: (focus: WorkoutFocus, item: TimelineItem) => void;
}) {
  const focus = useWorkoutFocus();
  const searched = useRef({ key: 0, pages: 0 });
  useEffect(() => {
    if (!focus || !active) return;
    if (locked) return clearWorkoutFocus(focus.key);
    if (!items || loadingMore) return;
    if (searched.current.key !== focus.key) searched.current = { key: focus.key, pages: 0 };
    const step = workoutFocusStep(focus, {
      workoutIds: items.map((item) => item.workout.id),
      hasMore,
      pagesSearched: searched.current.pages,
    });
    if (step === 'load-more') {
      searched.current.pages += 1;
      void loadMore();
      return;
    }
    clearWorkoutFocus(focus.key);
    const item = items.find((entry) => entry.workout.id === focus.workoutId);
    if (step === 'reveal' && item) onReveal(focus, item);
    else showWorkoutFocus(focus, 'detached');
  }, [focus, active, locked, items, hasMore, loadingMore, loadMore, onReveal]);
}

/**
 * Scrolls the feed to a revealed card and opens what the notification is about: its reactions on
 * the card, or its comments on the workout's own screen.
 */
function useFeedReveal(scroll: RefObject<ComponentRef<typeof ScrollView> | null>) {
  const nav = useSocialNavigation();
  const top = useSafeAreaInsets().top;
  const positions = useRef(new Map<string, number>());
  const waiting = useRef<string | null>(null);
  // Clear of the status bar, which Android draws over the page.
  const scrollTo = useCallback(
    (y: number) => scroll.current?.scrollTo({ y: Math.max(0, y - top - 16), animated: true }),
    [scroll, top],
  );
  const reveal = useCallback(
    (focus: WorkoutFocus, item: TimelineItem) => {
      const y = positions.current.get(focus.workoutId);
      if (y === undefined) waiting.current = focus.workoutId;
      else scrollTo(y);
      showWorkoutFocus(focus, 'reveal');
      if (focus.panel === 'comments')
        nav.openWorkout({
          id: item.workout.id,
          memberId: item.member.id,
          date: item.workout.workout_date,
          comments: true,
          commentId: focus.commentId,
        });
    },
    [nav, scrollTo],
  );
  const onCardLayout = useCallback(
    (workoutId: string, y: number) => {
      positions.current.set(workoutId, y);
      if (waiting.current !== workoutId) return;
      waiting.current = null;
      scrollTo(y);
    },
    [scrollTo],
  );
  return { reveal, onCardLayout };
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
  onCardLayout,
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
  onCardLayout: (workoutId: string, y: number) => void;
}) {
  const { colors, type } = useTheme();
  const nav = useSocialNavigation();
  const [pickingId, setPickingId] = useState<string | null>(null);
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
        <EmptyState
          icon={socialIcons.people}
          title={friends && friends.length > 0 ? 'No workouts yet' : 'No friends yet'}
          message={
            friends && friends.length > 0
              ? 'No workouts here yet. Sessions you and your friends log appear in this feed.'
              : 'Add friends to see their workouts and photos here.'
          }
          action={
            friends?.length === 0
              ? { label: 'Find friends', icon: 'search', onPress: onFindFriends }
              : undefined
          }
        />
      ) : (
        items.map((item) => (
          <View
            key={item.workout.id}
            style={pickingId === item.workout.id ? { zIndex: 10 } : undefined}
            onLayout={(event) => onCardLayout(item.workout.id, event.nativeEvent.layout.y)}
          >
            <FeedCard
              item={item}
              today={today}
              picking={pickingId === item.workout.id}
              dimmed={pickingId !== null && pickingId !== item.workout.id}
              onPickingChange={(open) =>
                setPickingId((current) =>
                  open ? item.workout.id : current === item.workout.id ? null : current,
                )
              }
            />
          </View>
        ))
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
          loading={loadingMore}
          onPress={onLoadMore}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  segmentWrap: { position: 'relative' },
  requestBadge: {
    position: 'absolute',
    top: -6,
    right: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
