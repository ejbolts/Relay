import { useContext, useEffect, useRef, useState } from 'react';
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
import { ReleaseAnnouncementContext } from './releaseAnnouncementContext';
import { ReleaseAnnouncement } from './ReleaseAnnouncement';
import { formatReleaseDate, type Release } from './releaseMetadata';
import type {
  SharingConnection,
  SharingNotifications,
  ReactionNotice,
  CommentNotice,
} from './types';
import './FollowNotifications.css';

export const NOTIFICATIONS_PER_PAGE = 15;

type NotificationRow =
  | { kind: 'release'; item: Release }
  | { kind: 'comment'; item: CommentNotice }
  | { kind: 'request'; item: SharingConnection }
  | { kind: 'reaction'; item: ReactionNotice }
  | { kind: 'accepted'; item: SharingConnection };

function notificationRows(items: SharingNotifications, release?: Release): NotificationRow[] {
  return [
    ...(release ? [{ kind: 'release' as const, item: release }] : []),
    ...(items.comments ?? []).map((item) => ({ kind: 'comment' as const, item })),
    ...items.requests.map((item) => ({ kind: 'request' as const, item })),
    ...(items.reactions ?? []).map((item) => ({ kind: 'reaction' as const, item })),
    ...items.accepted.map((item) => ({ kind: 'accepted' as const, item })),
  ];
}

function notificationPage(
  items: SharingNotifications,
  page: number,
  release?: Release,
): NotificationRow[] {
  const rows = notificationRows(items, release);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / NOTIFICATIONS_PER_PAGE)));
  return rows.slice(
    (currentPage - 1) * NOTIFICATIONS_PER_PAGE,
    currentPage * NOTIFICATIONS_PER_PAGE,
  );
}

function displayedNotifications(
  items: SharingNotifications,
  page: number,
  release?: Release,
): SharingNotifications {
  const visible: SharingNotifications = { requests: [], accepted: [], reactions: [], comments: [] };
  for (const row of notificationPage(items, page, release)) {
    if (row.kind === 'request') visible.requests.push(row.item);
    else if (row.kind === 'accepted') visible.accepted.push(row.item);
    else if (row.kind === 'reaction') visible.reactions!.push(row.item);
    else if (row.kind === 'comment') visible.comments!.push(row.item);
  }
  return visible;
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
  const [items, setItems] = useState<SharingNotifications | null>(null);
  const [open, setOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const list = useRef<HTMLUListElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const restoreBellFocus = useRef(false);

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
    async function refresh() {
      if (document.visibilityState === 'hidden' || refreshing) return;
      refreshing = true;
      try {
        const next = await api.sharing.notifications();
        if (cancelled) return;
        setItems(next);
        setError(null);
        const unread = unreadNotificationReferences(displayedNotifications(next, page, release));
        if (open && unread.length) {
          await api.sharing.markNotificationsRead(unread);
          if (!cancelled)
            setItems((current) => current && markNotificationSnapshotRead(current, unread));
        }
      } catch (reason) {
        if (!cancelled) setError(authErrorMessage(reason));
      } finally {
        refreshing = false;
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [active, open, attempt, page, release]);

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

  const count =
    (items ? unreadNotificationReferences(items).length : 0) +
    Number(announcement?.noticeUnread ?? false);
  const currentItems = items ?? { requests: [], accepted: [] };
  const rows = notificationRows(currentItems, release);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / NOTIFICATIONS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = notificationPage(currentItems, page, release);
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
              ) : row.kind === 'comment' ? (
                <li key={`comment-${row.item.notice_id}`}>
                  <ProfileAvatar className="profile-avatar" user={{ ...row.item, username: '' }} />
                  <div className="follow-notification-copy">
                    <p>
                      <strong>{row.item.display_name}</strong>
                      {row.item.kind === 'comment_reaction'
                        ? ' reacted to your comment on '
                        : row.item.kind === 'reply'
                          ? ' replied on '
                          : ' commented on '}
                      <b>{row.item.workout_name}</b>
                      <NotificationDate since={row.item.since} />
                    </p>
                    <p>{row.item.body}</p>
                  </div>
                  {row.item.reaction && (
                    <span className="follow-notification-emoji">
                      {reactionEmoji(row.item.reaction)}
                    </span>
                  )}
                </li>
              ) : row.kind === 'request' ? (
                <li key={`request-${row.item.id}`}>
                  <ProfileAvatar className="profile-avatar" user={{ ...row.item, username: '' }} />
                  <div className="follow-notification-copy">
                    <p>
                      <strong>{row.item.display_name}</strong> sent you a friend request
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
                <li key={`reaction-${row.item.workout_id}-${row.item.id}`}>
                  <ProfileAvatar className="profile-avatar" user={{ ...row.item, username: '' }} />
                  <div className="follow-notification-copy">
                    <p>
                      <strong>{row.item.display_name}</strong> reacted to{' '}
                      <b>{row.item.workout_name}</b>
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
                <li key={`accepted-${row.item.id}`}>
                  <ProfileAvatar className="profile-avatar" user={{ ...row.item, username: '' }} />
                  <div className="follow-notification-copy">
                    <p>
                      <strong>{row.item.display_name}</strong> accepted your friend request
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
            onPageChange={(next) => {
              setPage(next);
              const dialog = list.current?.closest('dialog');
              if (dialog) dialog.scrollTop = 0;
            }}
            label="notifications"
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
