import { useRef, type ComponentRef, type RefObject } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';

/** Room left above the comment, so it doesn't sit flush against the header. */
const ABOVE = 16;

/**
 * Scrolls a comment thread to a notification's comment once its row is laid out. The thread's
 * box (`onBox`, measured in the scroll view's content), the list inside it (`onList`) and the
 * row inside the list (`onTarget`, from `CommentList`) add up to the row's place. Without a
 * comment to find, or when every page is loaded and it isn't there, the thread's box is shown.
 */
export function useScrollToComment({
  enabled,
  commentId,
  scroll,
}: {
  enabled: boolean;
  commentId?: string;
  scroll: RefObject<ComponentRef<typeof ScrollView> | null>;
}) {
  const place = useRef<{ box?: number; list?: number; row?: number | null }>({});
  const done = useRef(false);
  const go = (y: number) => {
    done.current = true;
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, y), animated: true }));
  };
  const settle = () => {
    if (!enabled || done.current) return;
    const { box, list, row } = place.current;
    if (box === undefined) return;
    if (!commentId || row === null) go(box);
    else if (list !== undefined && row !== undefined) go(box + list + row - ABOVE);
  };
  return {
    onBox: (event: LayoutChangeEvent) => {
      place.current.box = event.nativeEvent.layout.y;
      settle();
    },
    onList: (event: LayoutChangeEvent) => {
      place.current.list = event.nativeEvent.layout.y;
      settle();
    },
    onTarget: (y: number | null) => {
      place.current.row = y;
      settle();
    },
  };
}
