import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a swiped-away goal can be brought back before it is deleted. */
export const GOAL_UNDO_MS = 4000;

export interface PendingGoalRemoval<G extends { id: string }> {
  goal: G;
  /** Where the goal sat in the list, so Undo puts it back in place. */
  index: number;
}

/**
 * Hides a swiped-away goal at once and deletes it only when the Undo window closes, so Undo
 * never has to recreate it. Starting another removal, dismissing the popup or leaving the
 * screen deletes the pending goal straight away.
 */
export function useGoalRemoval<G extends { id: string }>({
  remove,
  onRemoved,
  onRestore,
  onFailed,
}: {
  remove: (id: string) => Promise<void>;
  onRemoved: () => void;
  onRestore: (pending: PendingGoalRemoval<G>) => void;
  onFailed: (message: string) => void;
}) {
  const [pending, setPending] = useState<PendingGoalRemoval<G> | null>(null);
  const pendingRef = useRef<PendingGoalRemoval<G> | null>(null);
  const callbacks = useRef({ remove, onRemoved, onRestore, onFailed });
  useEffect(() => {
    callbacks.current = { remove, onRemoved, onRestore, onFailed };
  });

  const commit = useCallback(() => {
    const removal = pendingRef.current;
    if (!removal) return;
    pendingRef.current = null;
    setPending(null);
    callbacks.current
      .remove(removal.goal.id)
      .then(() => callbacks.current.onRemoved())
      .catch(() => {
        callbacks.current.onRestore(removal);
        callbacks.current.onFailed('Could not remove this goal. It has been restored.');
      });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(commit, GOAL_UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [pending, commit]);

  // Leaving the screen keeps the removal rather than silently cancelling it.
  useEffect(() => commit, [commit]);

  const pendingId = useCallback(() => pendingRef.current?.goal.id ?? null, []);

  return {
    pending,
    /** The goal hidden while its Undo window is open, if any. Stable across renders. */
    pendingId,
    start(goal: G, index: number) {
      commit();
      const removal = { goal, index };
      pendingRef.current = removal;
      setPending(removal);
    },
    undo() {
      const removal = pendingRef.current;
      if (!removal) return;
      pendingRef.current = null;
      setPending(null);
      callbacks.current.onRestore(removal);
    },
    dismiss: commit,
  };
}
