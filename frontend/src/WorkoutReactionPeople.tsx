import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { REACTIONS } from './friendFeedData';
import { PopupDialog } from './PopupDialog';
import { ProfileAvatar } from './ProfileAvatar';
import { ShowMoreButton } from './ShowMoreButton';
import type { WorkoutReactionPage } from './types';
import './workoutReactionPeople.css';

export function WorkoutReactionPeople({
  workoutId,
  highlightPersonId,
  onClose,
}: {
  workoutId: string;
  /** Someone whose reaction to find and highlight, such as one opened from a notification. */
  highlightPersonId?: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState<WorkoutReactionPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const highlighted = useRef<HTMLLIElement>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      let result = await api.sharing.reactionPeople(workoutId);
      const items = [...result.items];
      // Load further pages only until the highlighted person appears.
      while (
        highlightPersonId &&
        result.next_offset != null &&
        !items.some((person) => person.id === highlightPersonId)
      ) {
        result = await api.sharing.reactionPeople(workoutId, result.next_offset);
        items.push(...result.items.filter((item) => !items.some((row) => row.id === item.id)));
      }
      return { ...result, items };
    })().then(
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
  }, [workoutId, attempt, highlightPersonId]);

  useEffect(() => {
    if (page) highlighted.current?.scrollIntoView?.({ block: 'nearest' });
  }, [page]);

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
      variant="sheet"
      title="Reactions"
      className="reaction-people-sheet"
      onClose={onClose}
    >
      <div className="reaction-people-body" aria-busy={!page && !error}>
        {!page && !error && <p role="status">Loading reactions…</p>}
        {page?.items.length === 0 && <p>No reactions yet.</p>}
        {page && page.items.length > 0 && (
          <ul className="reaction-people-list">
            {page.items.map((person) => {
              const reaction = REACTIONS.find((entry) => entry.kind === person.reaction)!;
              return (
                <li
                  key={person.id}
                  ref={person.id === highlightPersonId ? highlighted : undefined}
                  className={person.id === highlightPersonId ? 'is-highlighted' : undefined}
                >
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
                className="pulse-button link small text-link"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {page?.next_offset != null && (
          <ShowMoreButton loading={loadingMore} onClick={() => void loadMore()} />
        )}
      </div>
    </PopupDialog>
  );
}
