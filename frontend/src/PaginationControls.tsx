import { useEffect, useRef, type RefObject } from 'react';
import { Icon } from './Icon';
import { pageSlots, revealListStart } from './pagination';
import './pagination.css';

/**
 * The one pager: ‹ 1 … 14 … 30 ›. Arrows plus at most five page buttons; a gap is a plain marker,
 * never a button. Hidden while everything fits on one page.
 */
export function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  label,
  hasMore = false,
  busy = false,
  scrollTarget,
  className = '',
}: {
  /** 1-based. */
  currentPage: number;
  /** With hasMore, the pages loaded so far. */
  totalPages: number;
  onPageChange: (page: number) => void;
  /** What is paged, for the labels: "workout history" reads "Next workout history page". */
  label: string;
  /** The total is not known yet: a trailing gap, and Next stays enabled. */
  hasMore?: boolean;
  /** A page is loading: taps are ignored, without disabling the buttons, so focus stays put. */
  busy?: boolean;
  /** The list's start, brought back into view after a page change when it has scrolled away. */
  scrollTarget?: RefObject<HTMLElement | null>;
  /** Placement, such as `is-sheet-footer` for a pager pinned to the foot of a sheet or pop-up. */
  className?: string;
}) {
  const nav = useRef<HTMLElement>(null);
  const focusCurrent = useRef(false);
  const last = hasMore ? Math.max(totalPages, currentPage, 1) : Math.max(totalPages, 1);
  const current = Math.min(Math.max(1, currentPage), last);

  // An arrow that turns disabled would drop focus, so it moves to the current page instead.
  useEffect(() => {
    if (!focusCurrent.current) return;
    focusCurrent.current = false;
    nav.current
      ?.querySelector<HTMLButtonElement>('[aria-current="page"]')
      ?.focus({ preventScroll: true });
  }, [current]);

  if (last <= 1 && !hasMore) return null;

  const atStart = current === 1;
  const atEnd = !hasMore && current === last;
  const pageName = (page: number) => (hasMore ? `Page ${page}` : `Page ${page} of ${last}`);

  function turnTo(page: number, pressed: HTMLButtonElement) {
    if (busy) return;
    const next = hasMore ? Math.max(1, page) : Math.min(last, Math.max(1, page));
    if (next === current) return;
    if (
      document.activeElement === pressed &&
      pressed.classList.contains('pagination-arrow') &&
      (next === 1 || (!hasMore && next === last))
    )
      focusCurrent.current = true;
    onPageChange(next);
    const target = scrollTarget?.current;
    if (target) window.requestAnimationFrame(() => revealListStart(target));
  }

  return (
    <nav
      ref={nav}
      className={`pagination-controls ${className}`.trim()}
      aria-label={`${label.charAt(0).toUpperCase()}${label.slice(1)} pages`}
      aria-busy={busy || undefined}
    >
      <button
        type="button"
        className="pagination-arrow"
        disabled={atStart}
        aria-label={`Previous ${label} page`}
        onClick={(event) => turnTo(current - 1, event.currentTarget)}
      >
        <Icon name="chevron-left" />
      </button>
      <span className="pagination-pages">
        {pageSlots(current, last, hasMore).map((slot, index) =>
          slot === null ? (
            <span key={`gap-${index}`} className="pagination-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={slot}
              type="button"
              className="pagination-page num"
              aria-label={pageName(slot)}
              aria-current={slot === current ? 'page' : undefined}
              onClick={(event) => turnTo(slot, event.currentTarget)}
            >
              {slot}
            </button>
          ),
        )}
      </span>
      <button
        type="button"
        className="pagination-arrow"
        disabled={atEnd}
        aria-label={`Next ${label} page`}
        onClick={(event) => turnTo(current + 1, event.currentTarget)}
      >
        <Icon name="chevron-right" />
      </button>
      <p className="pagination-status sr-only" aria-live="polite">
        {pageName(current)}
      </p>
    </nav>
  );
}
