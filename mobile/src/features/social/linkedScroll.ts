import { useCallback, useRef, type ComponentRef } from 'react';
import type { LayoutChangeEvent, ScrollView, View } from 'react-native';

/** Room left above a linked workout, so it doesn't sit flush against the header. */
const ABOVE = 12;

/** A section jump; `ready` once the content it was asked for (filtered results) has settled. */
type Section = { view: ComponentRef<typeof View>; animated: boolean; ready: boolean };

/**
 * Keeps a linked workout in view while the profile above it settles: cards that finish loading
 * later (splits, stats) push the row down, so each content size change scrolls to it again, until
 * the reader drags the profile. As the web's link, it lands at once, without animating.
 *
 * `scrollRef` goes on the profile's ScrollView with `onScrollBeginDrag`, `onContentSizeChange`
 * and `onLayout`; `targetRef` and `reveal` (its `onLayout`) go on the linked row.
 */
export function useLinkedScroll() {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const targetRef = useRef<ComponentRef<typeof View>>(null);
  const movedRef = useRef(false);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);
  const sectionRef = useRef<Section | null>(null);
  const reveal = useCallback(() => {
    const row = targetRef.current;
    const content = scrollRef.current?.getInnerViewRef?.();
    if (movedRef.current || !row || !content) return;
    requestAnimationFrame(() => {
      if (movedRef.current || targetRef.current !== row) return;
      row.measureLayout(content, (_x, y) =>
        scrollRef.current?.scrollTo({ y: Math.max(0, y - ABOVE), animated: false }),
      );
    });
  }, []);
  /**
   * Scrolls to the section asked for. It stays pending, jumping again as the page or the screen
   * changes size, until its content has settled and the page is long enough to bring it to the
   * top: results still loading can shorten the page, then lengthen it.
   */
  const jumpToSection = useCallback(() => {
    const pending = sectionRef.current;
    const content = scrollRef.current?.getInnerViewRef?.();
    if (!pending || !content) return;
    requestAnimationFrame(() => {
      if (sectionRef.current !== pending) return;
      pending.view.measureLayout(content, (_x, y) => {
        if (sectionRef.current !== pending) return;
        const target = Math.max(0, y - ABOVE);
        scrollRef.current?.scrollTo({ y: target, animated: pending.animated });
        if (pending.ready && target <= contentHeight.current - viewportHeight.current)
          sectionRef.current = null;
      });
    });
  }, []);
  const onScrollBeginDrag = useCallback(() => {
    movedRef.current = true;
    sectionRef.current = null;
  }, []);
  /**
   * Scrolls the profile to a section the reader asked for, as the web's calendar and lift taps
   * bring its history into view. The linked row stops being followed from then on, and a newer
   * request or a drag replaces it. `ready` says its content is already settled (nothing changed);
   * otherwise `sectionReady` says so once it has.
   */
  const scrollToSection = useCallback(
    (section: ComponentRef<typeof View> | null, animated: boolean, ready = false) => {
      if (!section) return;
      movedRef.current = true;
      sectionRef.current = { view: section, animated, ready };
      jumpToSection();
    },
    [jumpToSection],
  );
  /** The section's content has settled, such as the filtered workouts it was asked for. */
  const sectionReady = useCallback(() => {
    const pending = sectionRef.current;
    if (!pending || pending.ready) return;
    sectionRef.current = { ...pending, ready: true };
    jumpToSection();
  }, [jumpToSection]);
  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height;
      reveal();
      jumpToSection();
    },
    [reveal, jumpToSection],
  );
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeight.current = event.nativeEvent.layout.height;
      jumpToSection();
    },
    [jumpToSection],
  );
  return {
    scrollRef,
    targetRef,
    reveal,
    scrollToSection,
    sectionReady,
    onScrollBeginDrag,
    onContentSizeChange,
    onLayout,
  };
}

/** What the history needs to keep its linked row in view. */
export interface LinkedRow {
  targetRef: ReturnType<typeof useLinkedScroll>['targetRef'];
  reveal: () => void;
}
