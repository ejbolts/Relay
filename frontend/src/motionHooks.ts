import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motionReduced } from './motion';

const ACTIVE_CHILD =
  ':scope > .active, :scope > [aria-checked="true"], :scope > [aria-selected="true"]';

/**
 * Positions a shared highlight (the container's ::before) under the active child so it can glide
 * between options like an iOS segmented control. Pair with the `slide-indicator` class.
 */
export function useSlidingIndicator<T extends HTMLElement>(
  activeKey: unknown,
): (element: T | null) => void {
  // A callback ref, so controls that mount after data loads are still measured.
  const [container, setContainer] = useState<T | null>(null);

  useLayoutEffect(() => {
    if (!container) return;
    let frame = 0;

    const place = () => {
      const active = container.querySelector<HTMLElement>(ACTIVE_CHILD);
      if (!active || container.offsetWidth === 0) {
        // Hidden screens report zero sizes; re-enter without sliding from a stale position.
        delete container.dataset.indicatorReady;
        container.style.setProperty('--indicator-opacity', '0');
        return;
      }
      container.style.setProperty('--indicator-x', `${active.offsetLeft}px`);
      container.style.setProperty('--indicator-y', `${active.offsetTop}px`);
      container.style.setProperty('--indicator-w', `${active.offsetWidth}px`);
      container.style.setProperty('--indicator-h', `${active.offsetHeight}px`);
      container.style.setProperty('--indicator-opacity', '1');
      if (!container.dataset.indicatorReady) {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          container.dataset.indicatorReady = 'true';
        });
      }
    };

    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(container);
    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [activeKey, container]);

  return setContainer;
}

const MOVE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const ENTER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const ENTER_STAGGER_MS = 80;
const ENTER_MAX_STAGGERED = 5;

/**
 * FLIP animation for keyed lists: when `orderKey` changes (reorder, insert, delete), elements
 * marked with `data-flip-key` glide from their previous position and new ones fade in.
 *
 * Call the returned function from the event handler that adds items the user picked; the items
 * the next render introduces then rise in one after another and the first is brought into view,
 * even when the list was empty.
 */
export function useFlipAnimation(
  containerRef: RefObject<HTMLElement | null>,
  orderKey: string,
): () => void {
  const positions = useRef(new Map<string, number>());
  const previousOrder = useRef(orderKey);
  const entrancePending = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const announcedEntrance = entrancePending.current;
    entrancePending.current = false;
    if (!container) return;
    if (container.offsetWidth === 0) {
      // Hidden screens measure as zero; start fresh once visible.
      positions.current = new Map();
      previousOrder.current = orderKey;
      return;
    }
    const origin = container.getBoundingClientRect().top;
    const elements = [...container.querySelectorAll<HTMLElement>('[data-flip-key]')];
    const next = new Map<string, number>();
    elements.forEach((element) => {
      next.set(element.dataset.flipKey!, element.getBoundingClientRect().top - origin);
    });

    const orderChanged = previousOrder.current !== orderKey;
    const entering =
      orderChanged && announcedEntrance
        ? elements.filter((element) => !positions.current.has(element.dataset.flipKey!))
        : [];
    const reduced = motionReduced();
    entering[0]?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    if (!reduced) {
      entering.forEach((element, index) => {
        if (typeof element.animate !== 'function') return;
        element.animate(
          [
            { opacity: 0, transform: 'translateY(1.75rem) scale(0.96)' },
            { opacity: 1, transform: 'none' },
          ],
          {
            duration: 460,
            delay: Math.min(index, ENTER_MAX_STAGGERED) * ENTER_STAGGER_MS,
            easing: ENTER_EASING,
            fill: 'backwards',
          },
        );
      });
    }

    const measuredBefore = positions.current.size > 0;
    if (orderChanged && measuredBefore && !reduced) {
      elements.forEach((element) => {
        if (typeof element.animate !== 'function' || entering.includes(element)) return;
        const key = element.dataset.flipKey!;
        const before = positions.current.get(key);
        if (before === undefined) {
          element.animate(
            [
              { opacity: 0, transform: 'translateY(-8px)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 240, easing: MOVE_EASING },
          );
          return;
        }
        const offset = before - next.get(key)!;
        if (Math.abs(offset) < 1) return;
        element.animate([{ transform: `translateY(${offset}px)` }, { transform: 'none' }], {
          duration: 320,
          easing: MOVE_EASING,
        });
      });
    }

    positions.current = next;
    previousOrder.current = orderKey;
  });

  return useCallback(() => {
    entrancePending.current = true;
  }, []);
}

const EXPAND_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const EXPAND_ANIMATION_ID = 'expand';

/**
 * Smoothly resizes elements marked `data-expand-key` whenever their `data-expanded` value flips,
 * so rows open and close instead of jumping; the newly shown content fades in as it is revealed.
 */
export function useExpandAnimation(containerRef: RefObject<HTMLElement | null>) {
  const heights = useRef(new Map<string, { expanded: string; height: number }>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (container.offsetWidth === 0) {
      heights.current = new Map();
      return;
    }
    const next = new Map<string, { expanded: string; height: number }>();
    container.querySelectorAll<HTMLElement>('[data-expand-key]').forEach((element) => {
      const key = element.dataset.expandKey!;
      const expanded = element.dataset.expanded ?? '';
      const before = heights.current.get(key);
      const running = element
        .getAnimations?.()
        .find((animation) => animation.id === EXPAND_ANIMATION_ID);

      if (!before || before.expanded === expanded) {
        // Mid-animation sizes are transient; remember where a running resize is heading.
        const height = running && before ? before.height : element.offsetHeight;
        next.set(key, { expanded, height });
        return;
      }

      const from = running ? element.getBoundingClientRect().height : before.height;
      running?.cancel();
      const to = element.offsetHeight;
      next.set(key, { expanded, height: to });
      if (Math.abs(from - to) < 1 || motionReduced() || typeof element.animate !== 'function') {
        return;
      }

      element.style.overflow = 'clip';
      const resize = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: 340,
        easing: EXPAND_EASING,
        id: EXPAND_ANIMATION_ID,
      });
      const release = () => {
        if (!element.getAnimations().some((animation) => animation.id === EXPAND_ANIMATION_ID)) {
          element.style.overflow = '';
        }
      };
      resize.onfinish = release;
      resize.oncancel = release;
      for (const child of element.children) {
        child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
      }
    });
    heights.current = next;
  });
}

const HEIGHT_ANIMATION_ID = 'height';

/**
 * Glides an element to its new height whenever `key` changes, so a card that gains or loses rows
 * grows or shrinks and what follows it slides instead of jumping.
 */
export function useHeightAnimation(ref: RefObject<HTMLElement | null>, key: string) {
  const height = useRef<number | null>(null);
  const previousKey = useRef(key);

  useLayoutEffect(() => {
    const element = ref.current;
    const changed = previousKey.current !== key;
    previousKey.current = key;
    if (!element || element.offsetWidth === 0) {
      // Hidden or unmounted elements measure as zero; start fresh once visible.
      height.current = null;
      return;
    }
    const running = element
      .getAnimations?.()
      .find((animation) => animation.id === HEIGHT_ANIMATION_ID);
    if (!changed) {
      // Mid-animation sizes are transient; keep where a running resize is heading.
      if (!running) height.current = element.offsetHeight;
      return;
    }

    const from = running ? element.getBoundingClientRect().height : height.current;
    running?.cancel();
    const to = element.offsetHeight;
    height.current = to;
    if (
      from === null ||
      Math.abs(from - to) < 1 ||
      motionReduced() ||
      typeof element.animate !== 'function'
    ) {
      return;
    }

    element.style.overflow = 'clip';
    const resize = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 340,
      easing: EXPAND_EASING,
      id: HEIGHT_ANIMATION_ID,
    });
    const release = () => {
      if (!element.getAnimations().some((animation) => animation.id === HEIGHT_ANIMATION_ID)) {
        element.style.overflow = '';
      }
    };
    resize.onfinish = release;
    resize.oncancel = release;
  });
}

const COLLAPSE_ANIMATION_ID = 'collapse';

/**
 * Folds a card down to its header (and back) when `expanded` flips, using the same motion as set
 * rows. While closing, `data-collapsing` keeps the body painted so it slides away instead of
 * vanishing; pair with CSS that only hides collapsed content when that attribute is absent.
 */
export function useCollapseAnimation(ref: RefObject<HTMLElement | null>, expanded: boolean) {
  const height = useRef<number | null>(null);
  const previous = useRef(expanded);
  const active = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const changed = previous.current !== expanded;
    previous.current = expanded;
    const running = active.current?.playState === 'running' ? active.current : null;

    if (!changed) {
      if (!running) height.current = element.offsetHeight;
      return;
    }

    const from = running ? element.getBoundingClientRect().height : height.current;
    active.current = null;
    running?.cancel();
    element.getAnimations?.({ subtree: true }).forEach((animation) => {
      if (animation.id === COLLAPSE_ANIMATION_ID) animation.cancel();
    });
    delete element.dataset.collapsing;
    const to = element.offsetHeight;
    height.current = to;
    if (
      from === null ||
      Math.abs(from - to) < 1 ||
      element.offsetWidth === 0 ||
      motionReduced() ||
      typeof element.animate !== 'function'
    ) {
      element.style.overflow = '';
      return;
    }

    if (!expanded) element.dataset.collapsing = '';
    element.style.overflow = 'clip';
    const resize = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 340,
      easing: EXPAND_EASING,
      id: COLLAPSE_ANIMATION_ID,
    });
    active.current = resize;
    for (const child of element.children) {
      if (child.tagName === 'HEADER' || child.classList.contains('superset-ribbon')) continue;
      child.animate(
        expanded ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
        {
          duration: expanded ? 260 : 200,
          easing: 'ease-out',
          fill: 'forwards',
          id: COLLAPSE_ANIMATION_ID,
        },
      );
    }
    resize.onfinish = () => {
      if (active.current !== resize) return;
      active.current = null;
      delete element.dataset.collapsing;
      element.style.overflow = '';
      element.getAnimations({ subtree: true }).forEach((animation) => {
        if (animation.id === COLLAPSE_ANIMATION_ID) animation.cancel();
      });
    };
  });
}
