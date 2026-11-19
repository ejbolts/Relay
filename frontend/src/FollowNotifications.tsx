import { useContext, useEffect, useRef, useState } from 'react';
import { requestAdminAccountFocus } from './adminAccountFocus';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { Icon } from './Icon';
import { PaginationControls } from './PaginationControls';
import { PopupDialog } from './PopupDialog';
import { reactionEmoji } from './friendFeedData';
import {
  markNotificationSnapshotRead,
  unreadNotificationReferences,
} from './notificationReadState';
import { ProfileAvatar } from './ProfileAvatar';
import { onNotificationsChanged } from './notificationEvents';
import { ReleaseAnnouncementContext } from './releaseAnnouncementContext';
import { ReleaseAnnouncement } from './ReleaseAnnouncement';
import { requestSharedProfile } from './sharedProfileRequest';
import { WorkoutComments } from './WorkoutComments';
import { formatReleaseDate, type Release } from './releaseMetadata';
import { dayMonth } from './trainingSummary';
import { useUserSession } from './userContext';
import { requestWorkoutFocus } from './workoutFocus';
import {
  requestWeeklyReview,
  useWeeklyReviewNotice,
  type WeeklyReviewNotice,
} from './weeklyReviewNotice';
import type {
  NotificationReadReference,
  SharingConnection,
  SharingNotifications,
  ReactionNotice,
  CommentNotice,
  PasswordResetRequest,
} from './types';
import './FollowNotifications.css';

export const NOTIFICATIONS_PER_PAGE = 10;

type NotificationRow =
  | { kind: 'release'; item: Release }
  | { kind: 'weekly-review'; item: WeeklyReviewNotice }
  | { kind: 'password-reset'; item: PasswordResetRequest }
  | { kind: 'comment'; item: CommentNotice }
  | { kind: 'request'; item: SharingConnection }
  | { kind: 'reaction'; item: ReactionNotice }
  | { kind: 'accepted'; item: SharingConnection };

interface LocalNotices {
  release?: Release;
  /** The release notice has not been opened yet. */
  releaseUnread?: boolean;
  weeklyReview?: WeeklyReviewNotice | null;
  /** Only loaded for administrators. */
  resetRequests?: PasswordResetRequest[];
}

/** The start of the day after the reviewed week, when its review became available. */
function weeklyReviewTime(notice: WeeklyReviewNotice): number {
  const date = new Date(`${notice.weekEnd}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function notificationRows(
  items: SharingNotifications,
  { release, releaseUnread = false, weeklyReview, resetRequests = [] }: LocalNotices = {},
): NotificationRow[] {
  const rows: NotificationRow[] = [
    ...(release ? [{ kind: 'release' as const, item: release }] : []),
    ...(weeklyReview ? [{ kind: 'weekly-review' as const, item: weeklyReview }] : []),
    ...resetRequests.map((item) => ({ kind: 'password-reset' as const, item })),
    ...(items.comments ?? []).map((item) => ({ kind: 'comment' as const, item })),
    ...items.requests.map((item) => ({ kind: 'request' as const, item })),
    ...(items.reactions ?? []).map((item) => ({ kind: 'reaction' as const, item })),
    ...items.accepted.map((item) => ({ kind: 'accepted' as const, item })),
  ];
  const timestamp = (row: NotificationRow) => {
    if (row.kind === 'weekly-review') return weeklyReviewTime(row.item);
    const value = Date.parse(
      row.kind === 'release'
        ? (row.item.date ?? '')
        : row.kind === 'password-reset'
          ? row.item.requested_at
          : row.item.since,
    );
    return Number.isNaN(value) ? 0 : value;
  };
  // The app's own unread notices stay at the top of the first page, above newer social rows.
  const pinned = (row: NotificationRow) =>
    (row.kind === 'release' && releaseUnread) || (row.kind === 'weekly-review' && row.item.unread);
  return rows.sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || timestamp(b) - timestamp(a));
}

/** Identifies a social notice, including when it happened, so a repeat counts as new. */
function rowKey(reference: NotificationReadReference): string {
  return `${reference.kind}:${reference.id}:${reference.workout_id ?? ''}:${reference.since}`;
}

interface PersonProps {
  person: SharingConnection;
  onOpen: (person: SharingConnection) => void;
}

/** The photo of the person a notice is about, opening their shared profile. */
function PersonAvatar({ person, onOpen }: PersonProps) {
  return (
    <button
      type="button"
      className="follow-notification-avatar"
      // The name beside it is the keyboard and screen reader target; this adds a tap area.
      tabIndex={-1}
      aria-label={`View ${person.display_name}’s profile`}
      onClick={() => onOpen(person)}
    >
      <ProfileAvatar className="profile-avatar" user={{ ...person, username: '' }} />
    </button>
  );
}

/** The person's name, opening their shared profile. */
function PersonName({ person, onOpen }: PersonProps) {
  return (
    <button type="button" className="follow-notification-person" onClick={() => onOpen(person)}>
      {person.display_name}
    </button>
  );
}

function notificationPage(
  items: SharingNotifications,
  page: number,
  notices: LocalNotices,
): NotificationRow[] {
  const rows = notificationRows(items, notices);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / NOTIFICATIONS_PER_PAGE)));
  return rows.slice(
    (currentPage - 1) * NOTIFICATIONS_PER_PAGE,
    currentPage * NOTIFICATIONS_PER_PAGE,
  );
}

function displayedNotifications(
  items: SharingNotifications,
  page: number,
  notices: LocalNotices,
): SharingNotifications {
  const visible: SharingNotifications = { requests: [], accepted: [], reactions: [], comments: [] };
  for (const row of notificationPage(items, page, notices)) {
    if (row.kind === 'request') visible.requests.push(row.item);
    else if (row.kind === 'accepted') visible.accepted.push(row.item);
    else if (row.kind === 'reaction') visible.reactions!.push(row.item);
    else if (row.kind === 'comment') visible.comments!.push(row.item);
  }
  return visible;
}

/** The workout's name, as a button that covers the row and opens the workout in Social. */
function OpenWorkoutButton({
  name,
  label,
  onOpen,
}: {
  name: string;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="follow-notification-open" aria-label={label} onClick={onOpen}>
      {name}
    </button>
  );
}

function NotificationDate({ since }: { since: string }) {
  return (
    <span className="follow-notification-date">
      {' · '}
      <time dateTime={since}>
        {new Date(since).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </time>
    </span>
  );
}

/** Opening the compact inbox reads displayed notices; requests remain actionable. */
export function FollowNotifications({ active }: { active: boolean }) {
  const announcement = useContext(ReleaseAnnouncementContext);
  const release = announcement?.release;
  const releaseUnread = announcement?.noticeUnread ?? false;
  const weeklyReview = useWeeklyReviewNotice();
  const [items, setItems] = useState<SharingNotifications | null>(null);
  const [open, setOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [replying, setReplying] = useState<CommentNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  // Notices that were unread while the sheet has been open. Opening it marks them read, but
  // they keep their dot until the sheet is opened again.
  const [freshKeys, setFreshKeys] = useState<ReadonlySet<string>>(() => new Set());
  const list = useRef<HTMLUListElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const restoreBellFocus = useRef(false);
  const isAdmin = useUserSession().user?.is_admin === true;
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  // Read by the refresh below without restarting its polling when the requests change.
  const resetRequestsRef = useRef(resetRequests);
  resetRequestsRef.current = resetRequests;

  useEffect(() => {
    // Runs after the notes dialog has closed, so its own focus restoration cannot override this.
    if (releaseOpen || replying || !restoreBellFocus.current) return;
    restoreBellFocus.current = false;
    bell.current?.focus();
  }, [releaseOpen, replying]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let refreshing = false;
    let refreshAgain = false;
    const visible = () => document.visibilityState !== 'hidden';
    async function refresh() {
      if (cancelled || !visible()) return;
      if (refreshing) {
        refreshAgain = true;
        return;
      }
      refreshing = true;
      try {
        do {
          refreshAgain = false;
          const next = await api.sharing.notifications();
          if (cancelled) return;
          setItems(next);
          setError(null);
          const unread = unreadNotificationReferences(
            displayedNotifications(next, page, {
              release,
              releaseUnread,
              weeklyReview,
              resetRequests: resetRequestsRef.current,
            }),
          );
          if (open && unread.length) {
            await api.sharing.markNotificationsRead(unread);
            if (!cancelled)
              setItems((current) => current && markNotificationSnapshotRead(current, unread));
          }
        } while (refreshAgain && !cancelled && visible());
      } catch (reason) {
        if (!cancelled) setError(authErrorMessage(reason));
      } finally {
        refreshing = false;
        if (refreshAgain && !cancelled) void refresh();
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    const stopNotifications = onNotificationsChanged(onFocus);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      stopNotifications();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [active, open, attempt, page, release, releaseUnread, weeklyReview]);

  useEffect(() => {
    // Administrators also see people waiting for a temporary password, until it is handled.
    if (!active || !isAdmin) return;
    let cancelled = false;
    function refresh() {
      if (document.visibilityState === 'hidden') return;
      void api.admin
        .passwordResetRequests()
        .then((next) => {
          if (!cancelled) setResetRequests(next);
        })
        .catch(() => undefined);
    }
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [active, isAdmin, open]);
  const waitingResets = isAdmin ? resetRequests : [];

  useEffect(() => {
    if (!open || !items) return;
    const unread = unreadNotificationReferences(items).map(rowKey);
    setFreshKeys((current) =>
      unread.every((key) => current.has(key)) ? current : new Set([...current, ...unread]),
    );
  }, [open, items]);

  function openPerson(person: SharingConnection) {
    setOpen(false);
    requestSharedProfile(person);
  }
  function fresh(reference: NotificationReadReference): boolean {
    return freshKeys.has(rowKey(reference));
  }

  async function respond(person: SharingConnection, action: 'accept' | 'decline') {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'accept') await api.sharing.acceptFriend(person.id);
      else await api.sharing.removeFriend(person.id);
      setItems(
        (current) =>
          current && {
            ...current,
            requests: current.requests.filter((item) => item.id !== person.id),
          },
      );
      setAttempt((current) => current + 1);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  // Waiting friend requests always count; everything else counts until it has been read.
  const count =
    (items
      ? items.requests.length +
        unreadNotificationReferences(items).filter((item) => item.kind !== 'request').length
      : 0) +
    Number(announcement?.noticeUnread ?? false) +
    Number(weeklyReview?.unread ?? false) +
    // Like friend requests, these count until they have been dealt with.
    waitingResets.length;
  const currentItems = items ?? { requests: [], accepted: [] };
  const notices = {
    release,
    releaseUnread,
    weeklyReview,
    resetRequests: waitingResets,
  };
  const rows = notificationRows(currentItems, notices);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / NOTIFICATIONS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = notificationPage(currentItems, page, notices);
  return (
    <>
      <button
        ref={bell}
        type="button"
        className="icon-button-pulse follow-notification-button"
        aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        aria-haspopup="dialog"
        onClick={() => {
          setPage(1);
          setFreshKeys(new Set());
          setOpen(true);
        }}
      >
        <Icon name="bell" />
        {count > 0 && (
          <span className="profile-request-badge" aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <PopupDialog
          title="Notifications"
          className="follow-notifications"
          onClose={() => setOpen(false)}
        >
          {error && (
            <p className="inline-error" role="alert">
              {error}{' '}
              <button
                type="button"
                className="text-link"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Try again
              </button>
            </p>
          )}
          {!items && !error && (
            <p className="shared-card-empty" role="status">
              Loading notifications…
            </p>
          )}
          {items && total === 0 && (
            <p className="shared-card-empty">
              You're all caught up. Friend requests, workout reactions, comments and replies appear
              here.
            </p>
          )}
          <ul className="follow-notification-list" ref={list}>
            {pageRows.map((row) =>
              row.kind === 'release' ? (
                <li key={`release-${row.item.version}`} className="release-notification-row">
                  <span className="release-notification-icon" aria-hidden="true">
                    <Icon name="sparkle" />
                  </span>
                  <div className="follow-notification-copy">
                    <p>
                      <strong>Relay {row.item.version}</strong>
                      {announcement?.noticeUnread && (
                        <span className="release-notification-new">New</span>
                      )}
                    </p>
                    <p>{row.item.title}</p>
                    {row.item.date && (
                      <span className="follow-notification-date release-notification-date">
                        <time dateTime={row.item.date}>{formatReleaseDate(row.item.date)}</time>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="profile-secondary release-notification-view"
                    aria-label={`View Relay ${row.item.version} release notes`}
                    onClick={() => {
                      setOpen(false);
                      announcement?.readNotice();
                      setReleaseOpen(true);
                    }}
                  >
                    View
                  </button>
                </li>
              ) : row.kind === 'weekly-review' ? (
                <li
                  key={`weekly-review-${row.item.weekStart}`}
                  className="release-notification-row weekly-review-notification-row"
                >
                  <span className="release-notification-icon" aria-hidden="true">
                    <Icon name="trend" />
                  </span>
                  <div className="follow-notification-copy">
                    <p>
                      <strong>Weekly review</strong>
                      {row.item.unread && <span className="release-notification-new">New</span>}
                    </p>
                    <p>
                      {dayMonth(row.item.weekStart)} – {dayMonth(row.item.weekEnd)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="profile-secondary release-notification-view"
                    aria-label="View last week's review"
                    onClick={() => {
                      setOpen(false);
                      requestWeeklyReview();
                    }}
                  >
                    View
                  </button>
                </li>
              ) : row.kind === 'password-reset' ? (
                <li
                  key={`password-reset-${row.item.user_id}`}
                  className="release-notification-row password-reset-notification-row"
                >
                  <span className="release-notification-icon" aria-hidden="true">
                    <Icon name="key" />
                  </span>
                  <div className="follow-notification-copy">
                    <p>
                      <strong>{row.item.display_name}</strong> asked for a password reset
                      <NotificationDate since={row.item.requested_at} />
                    </p>
                  </div>
                  <button
                    type="button"
                    className="profile-secondary release-notification-view"
                    aria-label={`Review ${row.item.display_name}’s password reset request`}
                    onClick={() => {
                      setOpen(false);
                      requestAdminAccountFocus(row.item.user_id);
                    }}
                  >
                    Review
                  </button>
                </li>
              ) : row.kind === 'comment' ? (
                <li
                  key={`comment-${row.item.notice_id}`}
                  className={`is-openable${
                    fresh({ kind: 'comment', id: row.item.notice_id, since: row.item.since })
                      ? ' is-new'
                      : ''
                  }`}
                >
                  <PersonAvatar person={row.item} onOpen={openPerson} />
                  <div className="follow-notification-copy">
                    <p>
                      <strong>
                        <PersonName person={row.item} onOpen={openPerson} />
                      </strong>
                      {row.item.kind === 'comment_reaction'
                        ? ' reacted to your comment on '
                        : row.item.kind === 'reply'
                          ? ' replied on '
                          : ' commented on '}
                      <OpenWorkoutButton
                        name={row.item.workout_name}
                        label={`Open ${row.item.display_name}’s ${
                          row.item.kind === 'comment_reaction'
                            ? 'reaction to your comment'
                            : row.item.kind === 'reply'
                              ? 'reply'
                              : 'comment'
                        } on ${row.item.workout_name}`}
                        onOpen={() => {
                          setOpen(false);
                          requestWorkoutFocus({
                            workoutId: row.item.workout_id,
                            workoutName: row.item.workout_name,
                            panel: 'comments',
                            commentId: row.item.comment_id,
                          });
                        }}
                      />
                      <NotificationDate since={row.item.since} />
                    </p>
                    <p>{row.item.body}</p>
                  </div>
                  {row.item.reaction && (
                    <span className="follow-notification-emoji">
                      {reactionEmoji(row.item.reaction)}
                    </span>
                  )}
                  {row.item.kind !== 'comment_reaction' && (
                    <button
                      type="button"
                      className="follow-notification-reply"
                      aria-label={`Reply to ${row.item.display_name}`}
                      title="Reply"
                      onClick={() => {
                        setOpen(false);
                        setReplying(row.item);
                      }}
                    >
                      <Icon name="reply" />
                    </button>
                  )}
                </li>
              ) : row.kind === 'request' ? (
                <li
                  key={`request-${row.item.id}`}
                  className={
                    fresh({ kind: 'request', id: row.item.id, since: row.item.since })
                      ? 'is-new'
                      : undefined
                  }
                >
                  <PersonAvatar person={row.item} onOpen={openPerson} />
                  <div className="follow-notification-copy">
                    <p>
                      <strong>
                        <PersonName person={row.item} onOpen={openPerson} />
                      </strong>{' '}
                      sent you a friend request
                      <NotificationDate since={row.item.since} />
                    </p>
                    <div className="follow-notification-actions">
                      <button
                        type="button"
                        className="profile-primary"
                        disabled={busy}
                        aria-label={`Accept ${row.item.display_name}`}
                        onClick={() => void respond(row.item, 'accept')}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="profile-secondary"
                        disabled={busy}
                        aria-label={`Decline ${row.item.display_name}`}
                        onClick={() => void respond(row.item, 'decline')}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </li>
              ) : row.kind === 'reaction' ? (
                <li
                  key={`reaction-${row.item.workout_id}-${row.item.id}`}
                  className={`is-openable${
                    fresh({
                      kind: 'reaction',
                      id: row.item.id,
                      since: row.item.since,
                      workout_id: row.item.workout_id,
                    })
                      ? ' is-new'
                      : ''
                  }`}
                >
                  <PersonAvatar person={row.item} onOpen={openPerson} />
                  <div className="follow-notification-copy">
                    <p>
                      <strong>
                        <PersonName person={row.item} onOpen={openPerson} />
                      </strong>{' '}
                      reacted to{' '}
                      <OpenWorkoutButton
                        name={row.item.workout_name}
                        label={`Open ${row.item.display_name}’s reaction on ${row.item.workout_name}`}
                        onOpen={() => {
                          setOpen(false);
                          requestWorkoutFocus({
                            workoutId: row.item.workout_id,
                            workoutName: row.item.workout_name,
                            panel: 'people',
                            personId: row.item.id,
                          });
                        }}
                      />
                      <NotificationDate since={row.item.since} />
                    </p>
                  </div>
                  <span
                    className="follow-notification-emoji"
                    aria-label={`Reacted ${reactionEmoji(row.item.reaction)}`}
                  >
                    {reactionEmoji(row.item.reaction)}
                  </span>
                </li>
              ) : (
                <li
                  key={`accepted-${row.item.id}`}
                  className={
                    fresh({ kind: 'accepted', id: row.item.id, since: row.item.since })
                      ? 'is-new'
                      : undefined
                  }
                >
                  <PersonAvatar person={row.item} onOpen={openPerson} />
                  <div className="follow-notification-copy">
                    <p>
                      <strong>
                        <PersonName person={row.item} onOpen={openPerson} />
                      </strong>{' '}
                      accepted your friend request
                      <NotificationDate since={row.item.since} />
                    </p>
                  </div>
                  <Icon name="user" />
                </li>
              ),
            )}
          </ul>
          <PaginationControls
            currentPage={currentPage}
            totalPages={pageCount}
            onPageChange={setPage}
            label="notifications"
            className="is-sheet-footer"
            scrollTarget={list}
          />
        </PopupDialog>
      )}
      {replying && (
        <PopupDialog
          title={replying.workout_name}
          className="follow-notification-thread"
          onClose={() => {
            restoreBellFocus.current = true;
            setReplying(null);
          }}
        >
          <WorkoutComments
            workoutId={replying.workout_id}
            replyTo={replying.comment_id}
            onCountChange={() => {}}
          />
        </PopupDialog>
      )}
      {releaseOpen && announcement && (
        <ReleaseAnnouncement
          release={announcement.release}
          history={announcement.history}
          onClose={() => {
            restoreBellFocus.current = true;
            setReleaseOpen(false);
          }}
        />
      )}
    </>
  );
}
