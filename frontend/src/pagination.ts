import { motionReduced } from './motion';

/** Rows on a page of a list that is the main content of a screen or sheet. */
export const LIST_PAGE_SIZE = 10;

/**
 * The page buttons a pager shows, 1-based, with null for a gap. Never more than five slots, so the
 * arrows never move as you page, and a gap always stands for at least two pages:
 * `1 2 3 … 30`, `1 … 14 … 30`, `1 … 28 29 30`. With hasMore the total is not known yet, so a
 * trailing gap stands for the pages still to load.
 */
export function pageSlots(current: number, pages: number, hasMore = false): (number | null)[] {
  const first = (count: number) => Array.from({ length: count }, (_, index) => index + 1);
  if (hasMore) {
    if (pages <= 4) return [...first(pages), null];
    if (current <= 3) return [1, 2, 3, 4, null];
    return [1, null, current, null];
  }
  if (pages <= 5) return first(pages);
  if (current <= 3) return [1, 2, 3, null, pages];
  if (current >= pages - 2) return [1, null, pages - 2, pages - 1, pages];
  return [1, null, current, null, pages];
}

/**
 * The nearest ancestor that scrolls, such as a sheet, or null for the page itself. The root and
 * body count as the page: their boxes move with the scroll, so they cannot measure what is visible.
 */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (
    let parent = element.parentElement;
    parent && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    const { overflowY } = getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(overflowY) && parent.scrollHeight > parent.clientHeight)
      return parent;
  }
  return null;
}

/**
 * Brings a list's start back into view after a page change, but only when it has scrolled above
 * the visible area, so a short list already in view does not jump. A list that scrolls inside
 * itself starts again at its top. A sticky header at the top of a sheet and the list's
 * scroll-margin-top count as covering the visible area.
 */
export function revealListStart(target: HTMLElement) {
  if (target.scrollTop > 0) target.scrollTo?.({ top: 0 });
  const container = scrollParent(target);
  const header = container?.querySelector<HTMLElement>(':scope > header');
  const covered =
    header && getComputedStyle(header).position === 'sticky'
      ? header.getBoundingClientRect().height
      : 0;
  const visibleTop = (container?.getBoundingClientRect().top ?? 0) + covered;
  const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const offset = target.getBoundingClientRect().top - margin - visibleTop;
  if (offset >= 0) return;
  const behavior: ScrollBehavior = motionReduced() ? 'instant' : 'smooth';
  if (container) container.scrollBy?.({ top: offset, behavior });
  else window.scrollBy?.({ top: offset, behavior });
}
