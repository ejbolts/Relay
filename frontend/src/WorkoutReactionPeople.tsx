import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { REACTIONS } from './friendFeedData';
import { motionReduced } from './motion';
import { PopupDialog } from './PopupDialog';
import { ProfileAvatar } from './ProfileAvatar';
import type { WorkoutReactionPage } from './types';
import './workoutReactionPeople.css';

/** Matches the slide-down in workoutReactionPeople.css. */
const CLOSE_MS = 240;

export function WorkoutReactionPeople({
  workoutId,
  onClose,
}: {
  workoutId: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState<WorkoutReactionPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  /** Slides the sheet back down before it unmounts. */
  function dismiss() {
    if (closeTimer.current !== null) return;
    if (motionReduced()) return onClose();
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, CLOSE_MS);
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void api.sharing.reactionPeople(workoutId).then(
      (result) => {
        if (!cancelled) setPage(result);
      },
      (reason) => {
        if (!cancelled) setError(authErrorMessage(reason));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [workoutId, attempt]);

  async function loadMore() {
    if (loadingMore || page?.next_offset == null) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await api.sharing.reactionPeople(workoutId, page.next_offset);
      setPage((current) => ({
        ...next,
        items: [
          ...(current?.items ?? []),
          ...next.items.filter((item) => !current?.items.some((person) => person.id === item.id)),
        ],
      }));
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <PopupDialog
      title="Reactions"
      className={`reaction-people-sheet${closing ? ' is-closing' : ''}`}
      swipeToDismiss
      onClose={dismiss}
    >
      <div className="reaction-people-body" aria-busy={!page && !error}>
        {!page && !error && <p role="status">Loading reactions…</p>}
        {page?.items.length === 0 && <p>No reactions yet.</p>}
        {page && page.items.length > 0 && (
          <ul className="reaction-people-list">
            {page.items.map((person) => {
              const reaction = REACTIONS.find((entry) => entry.kind === person.reaction)!;
              return (
                <li key={person.id}>
                  <ProfileAvatar user={{ ...person, username: '' }} className="profile-avatar" />
                  <strong>{person.display_name}</strong>
                  <span className="reaction-person-emoji" role="img" aria-label={reaction.label}>
                    {reaction.emoji}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {error && (
          <div role="alert">
            <p className="inline-error">{error}</p>
            {!page && (
              <button
                type="button"
                className="text-link"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {page?.next_offset != null && (
          <button
            type="button"
            className="show-more-button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Loading…' : 'Show more'}
          </button>
        )}
      </div>
    </PopupDialog>
  );
}
