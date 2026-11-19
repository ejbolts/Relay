import type { ReactNode } from 'react';
import './pagination.css';

/**
 * Adds the next chunk to a stream whose total keeps changing: the feed, reactions, comments and
 * friends' activity. Lists you browse and come back to are paged with PaginationControls instead.
 * While loading it says so and ignores further taps, without disabling, so focus stays on it.
 */
export function ShowMoreButton({
  onClick,
  loading = false,
  children = 'Show more',
  className = '',
}: {
  onClick: () => void;
  loading?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`show-more-button ${className}`.trim()}
      aria-busy={loading || undefined}
      onClick={() => {
        if (!loading) onClick();
      }}
    >
      {loading ? (
        <>
          <span className="calendar-older-spinner" aria-hidden="true" />
          Loading…
        </>
      ) : (
        children
      )}
    </button>
  );
}
