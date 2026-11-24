import { useCallback, useRef, type ComponentRef } from 'react';
import type { ScrollView, View } from 'react-native';

/** Room left above a linked workout, so it doesn't sit flush against the header. */
const ABOVE = 12;

/**
 * Keeps a linked workout in view while the profile above it settles: cards that finish loading
 * later (splits, stats) push the row down, so each content size change scrolls to it again, until
 * the reader drags the profile. As the web's link, it lands at once, without animating.
 *
 * `scrollRef` goes on the profile's ScrollView with `onScrollBeginDrag` and
 * `onContentSizeChange`; `targetRef` and `reveal` (its `onLayout`) go on the linked row.
 */
export function useLinkedScroll() {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const targetRef = useRef<ComponentRef<typeof View>>(null);
  const movedRef = useRef(false);
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
  const onScrollBeginDrag = useCallback(() => {
    movedRef.current = true;
  }, []);
  /**
   * Scrolls the profile to a section the reader asked for, as the web's calendar and lift taps
   * bring its history into view. The linked row stops being followed from then on.
   */
  const scrollToSection = useCallback(
    (section: ComponentRef<typeof View> | null, animated: boolean) => {
      const content = scrollRef.current?.getInnerViewRef?.();
      if (!section || !content) return;
      movedRef.current = true;
      requestAnimationFrame(() =>
        section.measureLayout(content, (_x, y) =>
          scrollRef.current?.scrollTo({ y: Math.max(0, y - ABOVE), animated }),
        ),
      );
    },
    [],
  );
  return {
    scrollRef,
    targetRef,
    reveal,
    scrollToSection,
    onScrollBeginDrag,
    onContentSizeChange: reveal,
  };
}

/** What the history needs to keep its linked row in view. */
export interface LinkedRow {
  targetRef: ReturnType<typeof useLinkedScroll>['targetRef'];
  reveal: () => void;
}
