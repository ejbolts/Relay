import { useCallback, useRef, type ComponentRef } from 'react';
import type { LayoutChangeEvent, ScrollView, View } from 'react-native';

/** Room left above a linked workout, so it doesn't sit flush against the header. */
const ABOVE = 12;

type Section = { view: ComponentRef<typeof View>; animated: boolean };

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
   * Scrolls to the section asked for. While the page is too short to bring it to the top (its
   * results are still loading, say), the jump stays pending, and the page growing jumps again.
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
        if (target <= contentHeight.current - viewportHeight.current) sectionRef.current = null;
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
   * request or a drag replaces it.
   */
  const scrollToSection = useCallback(
    (section: ComponentRef<typeof View> | null, animated: boolean) => {
      if (!section) return;
      movedRef.current = true;
      sectionRef.current = { view: section, animated };
      jumpToSection();
    },
    [jumpToSection],
  );
  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height;
      reveal();
      jumpToSection();
    },
    [reveal, jumpToSection],
  );
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
  }, []);
  return {
    scrollRef,
    targetRef,
    reveal,
    scrollToSection,
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
