import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { reactionEmoji } from '../../../../frontend/src/friendFeedData';
import {
  ADMIN_REQUEST_TEXT,
  commentNoticeText,
  notificationCount,
  notificationDate,
  notificationKey,
  notificationReference,
  notificationRows,
  notificationsInRows,
  notificationsLabel,
  NOTIFICATIONS_EMPTY,
  NOTIFICATIONS_PER_PAGE,
  type NotificationRow as InboxRow,
  type SocialNotificationRow,
} from '../../../../frontend/src/notificationInbox';
import {
  markNotificationSnapshotRead,
  unreadNotificationReferences,
} from '../../../../frontend/src/notificationReadState';
import { profileBadgeText } from '../../../../frontend/src/profileButton';
import { formatReleaseDate } from '../../../../frontend/src/releaseMetadata';
import { dayMonth } from '../../../../frontend/src/trainingSummary';
import type {
  NotificationReadReference,
  SharingConnection,
  SharingNotifications,
} from '../../../../frontend/src/types';
import { notificationWorkoutFocus } from '../../../../frontend/src/workoutFocusRequest';
import { Button, errorMessage } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon, type IconPair } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { reviewRoutes, useBellNotices } from '../review';
import { reviewIcons } from '../review/routes';
import { useTheme } from '../../ui/theme';
import { adminRoutes } from '../admin';
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
 * requests, reactions and comments, the running release, last week's review and, for
 * administrators, people waiting for a reset or their username, with a count of what's unread or
 * waiting for an answer.
 */
export function NotificationsBell({ size = 40 }: { size?: number }) {
  const { colors, radius } = useTheme();
  const query = useNotifications();
  const bell = useBellNotices();
  const [open, setOpen] = useState(false);
  const count = notificationCount(query.data, bell.rows);
  const badge = profileBadgeText(count);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={notificationsLabel(count)}
        hitSlop={4}
        onPress={() => {
          haptics.tap();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.square,
          {
            width: size,
            height: size,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderColor: colors.lineStrong,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Icon name="bell" size={Math.round(size * 0.48)} color={colors.secondary} />
        {badge && (
          <View
            style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.page }]}
          >
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </Pressable>
      {open && <NotificationsSheet notices={bell} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The inbox. Opening it reads the notices on screen; they keep their highlight until it's opened
 * again. Friend requests stay until they're answered.
 */
function NotificationsSheet({
  notices,
  onClose,
}: {
  notices: ReturnType<typeof useBellNotices>;
  onClose: () => void;
}) {
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
  const rows = notificationRows(items ?? NO_ITEMS, notices.rows);
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
  const openApp = (row: AppRow) => {
    onClose();
    if (row.kind === 'release') {
      notices.readRelease();
      router.push(reviewRoutes.releaseNotes);
    } else if (row.kind === 'weekly-review') {
      router.push(reviewRoutes.weeklyReview);
    } else {
      // An administrator's request opens that account in the app's admin console.
      router.push(adminRoutes.account(row.item.user_id));
    }
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
      {!items && !query.error && (
        <ActivityIndicator accessibilityLabel="Loading notifications" color={colors.accentText} />
      )}
      {rows.length === 0 ? (
        items && (
          <Text style={[type.callout, { color: colors.secondary }]}>{NOTIFICATIONS_EMPTY}</Text>
        )
      ) : (
        <View style={styles.list}>
          {visible.map((row, index) => (
            <View
              key={isSocial(row) ? notificationKey(notificationReference(row)) : appRowKey(row)}
              style={
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.line,
                }
              }
            >
              {isSocial(row) ? (
                <NotificationRow
                  row={row}
                  fresh={fresh.has(notificationKey(notificationReference(row)))}
                  busy={friend.isPending}
                  onOpenPerson={openPerson}
                  onOpenWorkout={() => openWorkout(row)}
                  onRespond={respond}
                />
              ) : (
                <AppNoticeRow
                  row={row}
                  releaseUnread={!!notices.rows.releaseUnread}
                  onOpen={() => openApp(row)}
                />
              )}
            </View>
          ))}
          {rows.length > shown && (
            <Button
              label="Show more"
              variant="secondary"
              onPress={() => setShown((current) => current + NOTIFICATIONS_PER_PAGE)}
              style={{ marginTop: 12 }}
            />
          )}
        </View>
      )}
    </Sheet>
  );
}

const NO_ITEMS: SharingNotifications = { requests: [], accepted: [] };

type AppRow = Exclude<InboxRow, SocialNotificationRow>;

const isSocial = (row: InboxRow): row is SocialNotificationRow =>
  row.kind === 'comment' ||
  row.kind === 'request' ||
  row.kind === 'reaction' ||
  row.kind === 'accepted';

function appRowKey(row: AppRow): string {
  if (row.kind === 'release') return `release-${row.item.version}`;
  if (row.kind === 'weekly-review') return `weekly-review-${row.item.weekStart}`;
  return `${row.kind}-${row.item.user_id}`;
}

/** The app's own notices: the release, the weekly review and administrators' requests. */
function AppNoticeRow({
  row,
  releaseUnread,
  onOpen,
}: {
  row: AppRow;
  releaseUnread: boolean;
  onOpen: () => void;
}) {
  const { colors, type } = useTheme();
  const notice: {
    icon: IconPair;
    title: ReactNode;
    detail?: string | null;
    isNew: boolean;
    action: string;
    label: string;
  } =
    row.kind === 'release'
      ? {
          icon: reviewIcons.sparkle,
          title: `Relay ${row.item.version}`,
          detail: [row.item.title, row.item.date && formatReleaseDate(row.item.date)]
            .filter(Boolean)
            .join(' · '),
          isNew: releaseUnread,
          action: 'View',
          label: `View Relay ${row.item.version} release notes`,
        }
      : row.kind === 'weekly-review'
        ? {
            icon: reviewIcons.trend,
            title: 'Weekly review',
            detail: `${dayMonth(row.item.weekStart)} – ${dayMonth(row.item.weekEnd)}`,
            isNew: row.item.unread,
            action: 'View',
            label: 'View last week’s review',
          }
        : {
            icon: row.kind === 'password-reset' ? reviewIcons.key : reviewIcons.person,
            title: (
              <>
                {row.item.display_name}
                <Text style={{ fontWeight: '400' }}>
                  {ADMIN_REQUEST_TEXT[row.kind]}
                  <Text style={{ color: colors.muted }}>
                    {` · ${notificationDate(row.item.requested_at)}`}
                  </Text>
                </Text>
              </>
            ),
            isNew: false,
            action: 'Review',
            label: `Review ${row.item.display_name}’s ${
              row.kind === 'password-reset' ? 'password reset' : 'username'
            } request`,
          };
  return (
    <View accessibilityHint={notice.isNew ? 'New' : undefined} style={styles.row}>
      <View style={styles.gutter}>
        {notice.isNew && <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />}
      </View>
      <View style={[styles.noticeIcon, { backgroundColor: colors.accentSoft }]}>
        <Icon name={notice.icon} size={18} color={colors.accentText} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.noticeTitle}>
          <Text style={[type.callout, { color: colors.text, fontWeight: '700', flexShrink: 1 }]}>
            {notice.title}
          </Text>
          {notice.isNew && (
            <Text style={[type.caption, { color: colors.accentText, fontWeight: '700' }]}>New</Text>
          )}
        </View>
        {!!notice.detail && (
          <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={2}>
            {notice.detail}
          </Text>
        )}
      </View>
      <SmallButton label={notice.action} accessibilityLabel={notice.label} onPress={onOpen} />
    </View>
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
  const { colors, type } = useTheme();
  const person = row.item;
  const name = (
    <Text
      style={{ color: colors.text, fontWeight: '700' }}
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
    <Text style={[type.footnote, styles.copy, { color: colors.secondary }]}>
      {name}
      {row.kind === 'request'
        ? ' sent you a friend request'
        : row.kind === 'accepted'
          ? ' accepted your friend request'
          : row.kind === 'reaction'
            ? ' reacted to '
            : commentNoticeText(row.item.kind).verb}
      {workout && (
        <Text style={{ color: colors.text, fontWeight: '600' }}>{row.item.workout_name}</Text>
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
        <Icon name={socialIcons.reply} size={17} color={colors.muted} />
      )
    ) : row.kind === 'accepted' ? (
      <Icon name={socialIcons.people} size={18} color={colors.muted} />
    ) : null;
  const body = (
    <>
      <View style={styles.gutter}>
        {fresh && <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${person.display_name}’s profile`}
        onPress={() => onOpenPerson(person)}
        hitSlop={4}
      >
        <Avatar person={person} size={36} />
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
  const rowStyle = [styles.row, row.kind === 'request' && styles.requestRow];
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
  square: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -5,
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
  list: { paddingBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  requestRow: { alignItems: 'flex-start' },
  gutter: {
    width: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5 },
  copy: { lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  emoji: { fontSize: 20 },
  noticeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
});
