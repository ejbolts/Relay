import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { reactionEmoji } from '../../../../frontend/src/friendFeedData';
import {
  commentNoticeText,
  notificationDate,
  notificationKey,
  notificationReference,
  notificationsInRows,
  notificationsLabel,
  NOTIFICATIONS_EMPTY,
  NOTIFICATIONS_PER_PAGE,
  socialNotificationCount,
  sortedSocialNotificationRows,
  type SocialNotificationRow,
} from '../../../../frontend/src/notificationInbox';
import {
  markNotificationSnapshotRead,
  unreadNotificationReferences,
} from '../../../../frontend/src/notificationReadState';
import { profileBadgeText } from '../../../../frontend/src/profileButton';
import type {
  NotificationReadReference,
  SharingConnection,
  SharingNotifications,
} from '../../../../frontend/src/types';
import { notificationWorkoutFocus } from '../../../../frontend/src/workoutFocusRequest';
import { Button, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { useFriendAction } from './FriendsSection';
import { socialIcons } from './icons';
import { socialRoutes, useSocialNavigation } from './navigation';
import { SmallButton } from './parts';
import { socialApi } from './socialApi';
import { socialKeys, useNotifications } from './socialQueries';
import { requestWorkoutFocus } from './workoutFocus';

/**
 * The web's notifications bell, for Home's and Social's headers: friend requests, accepted
 * requests, reactions and comments, with a count of what's unread or waiting for an answer.
 */
export function NotificationsBell({ size = 36 }: { size?: number }) {
  const { colors } = useTheme();
  const query = useNotifications();
  const [open, setOpen] = useState(false);
  const count = socialNotificationCount(query.data);
  const badge = profileBadgeText(count);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={notificationsLabel(count)}
        hitSlop={6}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.round,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2 },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Icon name="bell" size={Math.round(size * 0.52)} color={colors.text} />
        {badge && (
          <View
            style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.page }]}
          >
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </Pressable>
      {open && <NotificationsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The inbox. Opening it reads the notices on screen; they keep their highlight until it's opened
 * again. Friend requests stay until they're answered.
 */
function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const { colors, type } = useTheme();
  const client = useQueryClient();
  const router = useRouter();
  const nav = useSocialNavigation();
  const query = useNotifications();
  const friend = useFriendAction();
  const [shown, setShown] = useState(NOTIFICATIONS_PER_PAGE);
  // Notices that were unread while the inbox has been open.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const items = query.data;
  const rows = items ? sortedSocialNotificationRows(items) : [];
  const visible = rows.slice(0, shown);
  const unreadKey = JSON.stringify(
    items ? unreadNotificationReferences(notificationsInRows(visible)) : [],
  );
  const mark = useMutation({
    mutationFn: (references: NotificationReadReference[]) =>
      socialApi.markNotificationsRead(references),
    onMutate: (references) =>
      setFresh((current) => new Set([...current, ...references.map(notificationKey)])),
    onSuccess: (_, references) =>
      client.setQueryData<SharingNotifications>(socialKeys.notifications, (current) =>
        current ? markNotificationSnapshotRead(current, references) : current,
      ),
  });
  const { mutate: markRead, isPending: marking, isError: markFailed } = mark;
  const failedKey = markFailed ? JSON.stringify(mark.variables) : null;
  useEffect(() => {
    const references = JSON.parse(unreadKey) as NotificationReadReference[];
    // A failed attempt isn't repeated for the same notices; the next refresh tries again.
    if (!references.length || marking || failedKey === unreadKey) return;
    markRead(references);
  }, [unreadKey, marking, failedKey, markRead]);

  const openPerson = (person: Pick<SharingConnection, 'id'>) => {
    onClose();
    nav.openProfile(person);
  };
  const openWorkout = (row: SocialNotificationRow) => {
    const focus = notificationWorkoutFocus(row);
    if (!focus) return openPerson(row.item);
    onClose();
    // Social's feed finds the workout and opens its reactions or comments.
    requestWorkoutFocus(focus);
    router.navigate(socialRoutes.tab);
  };
  const respond = (person: SharingConnection, action: 'accept' | 'decline') =>
    friend.mutate(
      { action, id: person.id },
      {
        onSuccess: () =>
          client.setQueryData<SharingNotifications>(socialKeys.notifications, (current) =>
            current
              ? { ...current, requests: current.requests.filter((item) => item.id !== person.id) }
              : current,
          ),
      },
    );

  const problem = query.error ?? friend.error;
  return (
    <Sheet visible onClose={onClose} title="Notifications">
      {problem && (
        <View style={styles.problem}>
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger, flex: 1 }]}>
            {errorMessage(problem)}
          </Text>
          {query.error && <SmallButton label="Try again" onPress={() => void query.refetch()} />}
        </View>
      )}
      {!items ? (
        !query.error && (
          <ActivityIndicator accessibilityLabel="Loading notifications" color={colors.accentText} />
        )
      ) : rows.length === 0 ? (
        <Text style={[type.callout, { color: colors.secondary }]}>{NOTIFICATIONS_EMPTY}</Text>
      ) : (
        <View style={{ gap: 2 }}>
          {visible.map((row) => (
            <NotificationRow
              key={notificationKey(notificationReference(row))}
              row={row}
              fresh={fresh.has(notificationKey(notificationReference(row)))}
              busy={friend.isPending}
              onOpenPerson={openPerson}
              onOpenWorkout={() => openWorkout(row)}
              onRespond={respond}
            />
          ))}
          {rows.length > shown && (
            <Button
              label="Show more"
              variant="secondary"
              onPress={() => setShown((current) => current + NOTIFICATIONS_PER_PAGE)}
            />
          )}
        </View>
      )}
    </Sheet>
  );
}

function NotificationRow({
  row,
  fresh,
  busy,
  onOpenPerson,
  onOpenWorkout,
  onRespond,
}: {
  row: SocialNotificationRow;
  fresh: boolean;
  busy: boolean;
  onOpenPerson: (person: SharingConnection) => void;
  onOpenWorkout: () => void;
  onRespond: (person: SharingConnection, action: 'accept' | 'decline') => void;
}) {
  const { colors, type, radius } = useTheme();
  const person = row.item;
  const name = (
    <Text
      style={{ fontWeight: '700' }}
      onPress={() => onOpenPerson(person)}
      accessibilityRole="link"
    >
      {person.display_name}
    </Text>
  );
  const date = (
    <Text style={{ color: colors.muted }}>{` · ${notificationDate(person.since)}`}</Text>
  );
  const workout = row.kind === 'comment' || row.kind === 'reaction';
  const text = (
    <Text style={[type.callout, { color: colors.text }]}>
      {name}
      {row.kind === 'request'
        ? ' sent you a friend request'
        : row.kind === 'accepted'
          ? ' accepted your friend request'
          : row.kind === 'reaction'
            ? ' reacted to '
            : commentNoticeText(row.item.kind).verb}
      {workout && (
        <Text style={{ color: colors.accentText, fontWeight: '600' }}>{row.item.workout_name}</Text>
      )}
      {date}
    </Text>
  );
  const label =
    row.kind === 'reaction'
      ? `Open ${person.display_name}’s reaction on ${row.item.workout_name}`
      : row.kind === 'comment'
        ? `Open ${person.display_name}’s ${commentNoticeText(row.item.kind).noun} on ${row.item.workout_name}`
        : undefined;
  const trailing =
    row.kind === 'reaction' ? (
      <Text style={styles.emoji} accessibilityLabel={`Reacted ${reactionEmoji(row.item.reaction)}`}>
        {reactionEmoji(row.item.reaction)}
      </Text>
    ) : row.kind === 'comment' ? (
      row.item.reaction ? (
        <Text style={styles.emoji}>{reactionEmoji(row.item.reaction)}</Text>
      ) : (
        <Icon name={socialIcons.reply} size={16} color={colors.secondary} />
      )
    ) : row.kind === 'accepted' ? (
      <Icon name={socialIcons.people} size={18} color={colors.secondary} />
    ) : null;
  const body = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${person.display_name}’s profile`}
        onPress={() => onOpenPerson(person)}
        hitSlop={4}
      >
        <Avatar person={person} size={40} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        {text}
        {row.kind === 'comment' && !!row.item.body && (
          <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={3}>
            {row.item.body}
          </Text>
        )}
        {row.kind === 'request' && (
          <View style={styles.actions}>
            <SmallButton
              label="Accept"
              variant="primary"
              disabled={busy}
              accessibilityLabel={`Accept ${person.display_name}`}
              onPress={() => onRespond(person, 'accept')}
            />
            <SmallButton
              label="Decline"
              disabled={busy}
              accessibilityLabel={`Decline ${person.display_name}`}
              onPress={() => onRespond(person, 'decline')}
            />
          </View>
        )}
      </View>
      {trailing}
    </>
  );
  const rowStyle = [
    styles.row,
    { borderRadius: radius.lg, overflow: 'hidden' as const },
    fresh && { backgroundColor: colors.accentSoft },
  ];
  return workout ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={fresh ? 'New' : undefined}
      onPress={onOpenWorkout}
      style={({ pressed }) => [rowStyle, pressed && { opacity: 0.6 }]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={rowStyle} accessibilityHint={fresh ? 'New' : undefined}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  round: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  problem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  emoji: { fontSize: 20 },
});
