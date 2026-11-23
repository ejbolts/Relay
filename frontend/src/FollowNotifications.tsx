import { useContext, useEffect, useRef, useState } from 'react';
import { requestAdminAccountFocus } from './adminAccountFocus';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { Icon } from './Icon';
import { PaginationControls } from './PaginationControls';
import { PopupDialog } from './PopupDialog';
import { reactionEmoji } from './friendFeedData';
import {
  commentNoticeText,
  newestFirst,
  noticeTime,
  notificationDate,
  notificationKey,
  notificationPageCount,
  notificationPageRows,
  notificationReference,
  notificationsInRows,
  notificationsLabel,
  NOTIFICATIONS_EMPTY,
  socialNotificationCount,
  socialNotificationRows,
  type SocialNotificationRow,
} from './notificationInbox';
import {
  markNotificationSnapshotRead,
  unreadNotificationReferences,
} from './notificationReadState';
import { ProfileAvatar } from './ProfileAvatar';
import { onNotificationsChanged } from './notificationEvents';
import { ReleaseAnnouncementContext } from './releaseAnnouncementContext';
import { ReleaseAnnouncement } from './ReleaseAnnouncement';
import { requestSharedProfile } from './sharedProfileRequest';
import { formatReleaseDate, type Release } from './releaseMetadata';
import { dayMonth } from './trainingSummary';
import { useUserSession } from './userContext';
import { requestWorkoutFocus } from './workoutFocus';
import { notificationWorkoutFocus } from './workoutFocusRequest';
import {
  requestWeeklyReview,
  useWeeklyReviewNotice,
  type WeeklyReviewNotice,
} from './weeklyReviewNotice';
import type {
  NotificationReadReference,
  SharingConnection,
  SharingNotifications,
  CommentNotice,
  PasswordResetRequest,
  UsernameReminderRequest,
} from './types';
import './FollowNotifications.css';

export { NOTIFICATIONS_PER_PAGE } from './notificationInbox';

type NotificationRow =
  | { kind: 'release'; item: Release }
  | { kind: 'weekly-review'; item: WeeklyReviewNotice }
  | { kind: 'password-reset'; item: PasswordResetRequest }
  | { kind: 'username-reminder'; item: UsernameReminderRequest }
  | SocialNotificationRow;

interface LocalNotices {
  release?: Release;
  /** The release notice has not been opened yet. */
  releaseUnread?: boolean;
  weeklyReview?: WeeklyReviewNotice | null;
  /** Only loaded for administrators. */
  resetRequests?: PasswordResetRequest[];
  /** Only loaded for administrators. */
  usernameRequests?: UsernameReminderRequest[];
}

/** The start of the day after the reviewed week, when its review became available. */
function weeklyReviewTime(notice: WeeklyReviewNotice): number {
  const date = new Date(`${notice.weekEnd}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function notificationRows(
  items: SharingNotifications,
  {
    release,
    releaseUnread = false,
    weeklyReview,
    resetRequests = [],
    usernameRequests = [],
  }: LocalNotices = {},
): NotificationRow[] {
  const rows: NotificationRow[] = [
    ...(release ? [{ kind: 'release' as const, item: release }] : []),
    ...(weeklyReview ? [{ kind: 'weekly-review' as const, item: weeklyReview }] : []),
    ...resetRequests.map((item) => ({ kind: 'password-reset' as const, item })),
    ...usernameRequests.map((item) => ({ kind: 'username-reminder' as const, item })),
    ...socialNotificationRows(items),
  ];
  const timestamp = (row: NotificationRow) => {
    if (row.kind === 'weekly-review') return weeklyReviewTime(row.item);
    return noticeTime(
      row.kind === 'release'
        ? row.item.date
        : row.kind === 'password-reset' || row.kind === 'username-reminder'
          ? row.item.requested_at
          : row.item.since,
    );
  };
  // The app's own unread notices stay at the top of the first page, above newer social rows.
  const pinned = (row: NotificationRow) =>
    (row.kind === 'release' && releaseUnread) || (row.kind === 'weekly-review' && row.item.unread);
  return newestFirst(rows, timestamp, pinned);
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
  return notificationPageRows(notificationRows(items, notices), page);
}

function displayedNotifications(
  items: SharingNotifications,
  page: number,
  notices: LocalNotices,
): SharingNotifications {
  return notificationsInRows(notificationPage(items, page, notices));
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
      <time dateTime={since}>{notificationDate(since)}</time>
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
  const [usernameRequests, setUsernameRequests] = useState<UsernameReminderRequest[]>([]);
  // Read by the refresh below without restarting its polling when the requests change.
  const resetRequestsRef = useRef(resetRequests);
  resetRequestsRef.current = resetRequests;
  const usernameRequestsRef = useRef(usernameRequests);
  usernameRequestsRef.current = usernameRequests;

  useEffect(() => {
    // Runs after the notes dialog has closed, so its own focus restoration cannot override this.
    if (releaseOpen || !restoreBellFocus.current) return;
    restoreBellFocus.current = false;
    bell.current?.focus();
  }, [releaseOpen]);

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
              usernameRequests: usernameRequestsRef.current,
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
    // Administrators also see people waiting for a temporary password or their username, until
    // it is handled.
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
      void api.admin
        .usernameReminderRequests()
        .then((next) => {
          if (!cancelled) setUsernameRequests(next);
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
  const waitingUsernames = isAdmin ? usernameRequests : [];

  useEffect(() => {
    if (!open || !items) return;
    const unread = unreadNotificationReferences(items).map(notificationKey);
    setFreshKeys((current) =>
      unread.every((key) => current.has(key)) ? current : new Set([...current, ...unread]),
    );
  }, [open, items]);

  function openPerson(person: SharingConnection) {
    setOpen(false);
    requestSharedProfile(person);
  }
  /** Both the workout name and Reply open the comment in its workout on the Social feed. */
  function openComment(notice: CommentNotice) {
    setOpen(false);
    requestWorkoutFocus(notificationWorkoutFocus({ kind: 'comment', item: notice })!);
  }
  function fresh(reference: NotificationReadReference): boolean {
    return freshKeys.has(notificationKey(reference));
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
    socialNotificationCount(items) +
    Number(announcement?.noticeUnread ?? false) +
    Number(weeklyReview?.unread ?? false) +
    // Like friend requests, these count until they have been dealt with.
    waitingResets.length +
    waitingUsernames.length;
  const currentItems = items ?? { requests: [], accepted: [] };
  const notices = {
    release,
    releaseUnread,
    weeklyReview,
    resetRequests: waitingResets,
    usernameRequests: waitingUsernames,
  };
  const rows = notificationRows(currentItems, notices);
  const total = rows.length;
  const pageCount = notificationPageCount(total);
  const currentPage = Math.min(page, pageCount);
  const pageRows = notificationPage(currentItems, page, notices);
  return (
    <>
      <button
        ref={bell}
        type="button"
        className="icon-button-pulse follow-notification-button"
        aria-label={notificationsLabel(count)}
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
                className="pulse-button link small"
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
          {items && total === 0 && <p className="shared-card-empty">{NOTIFICATIONS_EMPTY}</p>}
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
                    className="pulse-button secondary small release-notification-view"
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
                    className="pulse-button secondary small release-notification-view"
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
                    className="pulse-button secondary small release-notification-view"
                    aria-label={`Review ${row.item.display_name}’s password reset request`}
                    onClick={() => {
                      setOpen(false);
                      requestAdminAccountFocus(row.item.user_id);
                    }}
                  >
                    Review
                  </button>
                </li>
              ) : row.kind === 'username-reminder' ? (
                <li
                  key={`username-reminder-${row.item.user_id}`}
                  className="release-notification-row username-reminder-notification-row"
                >
                  <span className="release-notification-icon" aria-hidden="true">
                    <Icon name="user" />
                  </span>
                  <div className="follow-notification-copy">
                    <p>
                      <strong>{row.item.display_name}</strong> asked for their username
                      <NotificationDate since={row.item.requested_at} />
                    </p>
                  </div>
                  <button
                    type="button"
                    className="profile-secondary release-notification-view"
                    aria-label={`Review ${row.item.display_name}’s username request`}
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
                  className={`is-openable${fresh(notificationReference(row)) ? ' is-new' : ''}`}
                >
                  <PersonAvatar person={row.item} onOpen={openPerson} />
                  <div className="follow-notification-copy">
                    <p>
                      <strong>
                        <PersonName person={row.item} onOpen={openPerson} />
                      </strong>
                      {commentNoticeText(row.item.kind).verb}
                      <OpenWorkoutButton
                        name={row.item.workout_name}
                        label={`Open ${row.item.display_name}’s ${
                          commentNoticeText(row.item.kind).noun
                        } on ${row.item.workout_name}`}
                        onOpen={() => openComment(row.item)}
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
                      onClick={() => openComment(row.item)}
                    >
                      <Icon name="reply" />
                    </button>
                  )}
                </li>
              ) : row.kind === 'request' ? (
                <li
                  key={`request-${row.item.id}`}
                  className={fresh(notificationReference(row)) ? 'is-new' : undefined}
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
                  className={`is-openable${fresh(notificationReference(row)) ? ' is-new' : ''}`}
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
                          requestWorkoutFocus(notificationWorkoutFocus(row)!);
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
                  className={fresh(notificationReference(row)) ? 'is-new' : undefined}
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
