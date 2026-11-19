// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaginationControls } from './PaginationControls';
import { pageSlots, revealListStart } from './pagination';

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
/** The visible slots: page numbers, "…" for a gap, ‹ and › for the arrows. */
const slots = () =>
  [...host.querySelectorAll('nav > button, .pagination-pages > *')].map((item) =>
    item.classList.contains('pagination-arrow')
      ? item.getAttribute('aria-label')!.startsWith('Previous')
        ? '‹'
        : '›'
      : `${item.textContent}${item.getAttribute('aria-current') ? '*' : ''}`,
  );

function Pager({
  total = 30,
  start = 1,
  hasMore = false,
  busy = false,
  onChange = () => {},
}: {
  total?: number;
  start?: number;
  hasMore?: boolean;
  busy?: boolean;
  onChange?: (page: number) => void;
}) {
  const [page, setPage] = useState(start);
  const list = useRef<HTMLUListElement>(null);
  return (
    <>
      <ul ref={list} />
      <PaginationControls
        label="session"
        currentPage={page}
        totalPages={total}
        hasMore={hasMore}
        busy={busy}
        scrollTarget={list}
        onPageChange={(next) => {
          onChange(next);
          setPage(next);
        }}
      />
    </>
  );
}

async function click(target: HTMLButtonElement) {
  target.focus();
  await act(async () => target.click());
}

describe('pageSlots', () => {
  it('lists every page when five or fewer', () => {
    expect(pageSlots(1, 1)).toEqual([1]);
    expect(pageSlots(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps five slots, with first and last, and gaps that each hide two or more pages', () => {
    expect(pageSlots(1, 30)).toEqual([1, 2, 3, null, 30]);
    expect(pageSlots(3, 30)).toEqual([1, 2, 3, null, 30]);
    expect(pageSlots(4, 30)).toEqual([1, null, 4, null, 30]);
    expect(pageSlots(14, 30)).toEqual([1, null, 14, null, 30]);
    expect(pageSlots(27, 30)).toEqual([1, null, 27, null, 30]);
    expect(pageSlots(28, 30)).toEqual([1, null, 28, 29, 30]);
    expect(pageSlots(30, 30)).toEqual([1, null, 28, 29, 30]);
    expect(pageSlots(4, 6)).toEqual([1, null, 4, 5, 6]);
    for (let pages = 1; pages <= 40; pages += 1)
      for (let current = 1; current <= pages; current += 1) {
        const shown = pageSlots(current, pages);
        expect(shown.length).toBeLessThanOrEqual(5);
        expect(shown).toContain(current);
        shown.forEach((slot, index) => {
          if (slot !== null) return;
          expect((shown[index + 1] as number) - (shown[index - 1] as number)).toBeGreaterThan(2);
        });
      }
  });

  it('ends with a gap while the total is unknown', () => {
    expect(pageSlots(1, 1, true)).toEqual([1, null]);
    expect(pageSlots(2, 3, true)).toEqual([1, 2, 3, null]);
    expect(pageSlots(2, 6, true)).toEqual([1, 2, 3, 4, null]);
    expect(pageSlots(6, 6, true)).toEqual([1, null, 6, null]);
  });
});

describe('PaginationControls', () => {
  it('shows arrows and at most five numbered pages, with plain gaps and the page announced', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<Pager start={14} onChange={onChange} />));
    const nav = host.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Session pages');
    expect(slots()).toEqual(['‹', '1', '…', '14*', '…', '30', '›']);
    // A gap is a marker, not a button, and there is no page menu.
    expect(host.querySelectorAll('.pagination-gap[aria-hidden="true"]')).toHaveLength(2);
    expect(host.querySelectorAll('.pagination-gap button, [aria-haspopup]')).toHaveLength(0);
    expect(button('Page 14 of 30').getAttribute('aria-current')).toBe('page');
    const status = host.querySelector('.pagination-status')!;
    expect(status.classList.contains('sr-only')).toBe(true);
    expect(status.textContent).toBe('Page 14 of 30');

    await click(button('Page 30 of 30'));
    expect(onChange).toHaveBeenLastCalledWith(30);
    expect(slots()).toEqual(['‹', '1', '…', '28', '29', '30*', '›']);
    expect(button('Next session page').disabled).toBe(true);
    expect(status.textContent).toBe('Page 30 of 30');
    // The pressed page button stays in place and keeps focus.
    expect(document.activeElement).toBe(button('Page 30 of 30'));

    await click(button('Previous session page'));
    expect(onChange).toHaveBeenLastCalledWith(29);
    expect(document.activeElement).toBe(button('Previous session page'));
  });

  it('moves focus to the current page when the pressed arrow turns disabled', async () => {
    await act(async () => root.render(<Pager total={3} start={2} />));
    expect(slots()).toEqual(['‹', '1', '2*', '3', '›']);
    await click(button('Previous session page'));
    expect(button('Previous session page').disabled).toBe(true);
    expect(document.activeElement).toBe(button('Page 1 of 3'));
    await click(button('Page 3 of 3'));
    await click(button('Previous session page'));
    await click(button('Next session page'));
    expect(button('Next session page').disabled).toBe(true);
    expect(document.activeElement).toBe(button('Page 3 of 3'));
  });

  it('is hidden on a single page', async () => {
    await act(async () => root.render(<Pager total={1} />));
    expect(host.querySelector('nav')).toBeNull();
    await act(async () => root.render(<Pager total={0} />));
    expect(host.querySelector('nav')).toBeNull();
  });

  it('keeps Next and a trailing gap while more pages may load', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<Pager total={2} start={2} hasMore onChange={onChange} />));
    expect(slots()).toEqual(['‹', '1', '2*', '…', '›']);
    expect(button('Page 2').getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('.pagination-status')?.textContent).toBe('Page 2');
    expect(button('Next session page').disabled).toBe(false);
    await click(button('Next session page'));
    expect(onChange).toHaveBeenLastCalledWith(3);
    expect(slots()).toEqual(['‹', '1', '2', '3*', '…', '›']);
  });

  it('ignores taps while busy without disabling, so focus stays put', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<Pager total={5} start={2} busy onChange={onChange} />));
    expect(host.querySelector('nav')?.getAttribute('aria-busy')).toBe('true');
    const next = button('Next session page');
    expect(next.disabled).toBe(false);
    await click(next);
    await click(button('Page 5 of 5'));
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('Page 5 of 5'));
  });

  it('brings the list start back into view after a page change', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    await act(async () => root.render(<Pager total={5} />));
    const list = host.querySelector('ul')!;
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    // Scrolled past: the list starts 300px above the top of the window.
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ top: -300 } as DOMRect);
    await click(button('Next session page'));
    frames.forEach((frame) => frame(0));
    expect(scrollBy).toHaveBeenCalledWith({ top: -300, behavior: 'smooth' });
  });
});

describe('revealListStart', () => {
  it('leaves a list whose start is already in view where it is', () => {
    const list = document.createElement('ul');
    host.append(list);
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ top: 120 } as DOMRect);
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    revealListStart(list);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('measures against the window even when the root element is the scrolling box', () => {
    const list = document.createElement('ul');
    host.append(list);
    const root = document.documentElement;
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element) =>
        ({
          overflowY: element === root || element === document.body ? 'auto' : 'visible',
          position: 'static',
          scrollMarginTop: '0px',
        }) as CSSStyleDeclaration,
    );
    Object.defineProperty(root, 'scrollHeight', { value: 2000, configurable: true });
    // The document has scrolled 700px, so its own box starts far above the window.
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ top: -700 } as DOMRect);
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ top: -40 } as DOMRect);
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    revealListStart(list);
    expect(scrollBy).toHaveBeenCalledWith({ top: -40, behavior: 'smooth' });
    delete (root as unknown as { scrollHeight?: number }).scrollHeight;
  });

  it('starts a list that scrolls inside itself again at the top', () => {
    const list = document.createElement('ul');
    host.append(list);
    Object.defineProperty(list, 'scrollTop', { value: 80, configurable: true });
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo;
    revealListStart(list);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});
