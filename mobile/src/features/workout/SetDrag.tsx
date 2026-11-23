import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { haptics } from '../../ui/haptics';

/** As long as the web's set handle asks a finger to rest before a drag starts. */
export const SET_DRAG_HOLD_MS = 500;

/** Where each set's block (the set and the rest or "+" row after it) sits in the card. */
export type SetBlock = { y: number; height: number };

/**
 * The place a dragged set drops into: the block under the dragged block's middle, so a set moves
 * once it is dragged halfway over its neighbour, staying within the first and last places.
 */
export function setDropIndex(blocks: (SetBlock | undefined)[], from: number, dy: number): number {
  const dragged = blocks[from];
  if (!dragged) return from;
  const middle = dragged.y + dragged.height / 2 + dy;
  let index = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block && middle >= block.y) index = i;
  }
  return index;
}

/**
 * The card's set drag, as the web's set handle: hold a set, drag it, and let go to move it. The
 * dragged block follows the finger and the place it will drop into is outlined; set numbers,
 * types and rests follow the sets once it drops, since they belong to each set.
 */
export function useSetDrag(setKeys: string[], onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<{ key: string; target: number } | null>(null);
  const [offset] = useState(() => new Animated.Value(0));
  const layouts = useRef(new Map<string, SetBlock>());
  const latest = useRef({ setKeys, onMove, drag });
  useEffect(() => {
    latest.current = { setKeys, onMove, drag };
  });

  const measure = useCallback((key: string, block: SetBlock) => {
    layouts.current.set(key, block);
  }, []);

  const start = useCallback(
    (key: string) => {
      const from = latest.current.setKeys.indexOf(key);
      if (from < 0) return;
      offset.setValue(0);
      haptics.press();
      setDrag({ key, target: from });
    },
    [offset],
  );

  const move = useCallback(
    (key: string, dy: number) => {
      const { setKeys: keys, drag: current } = latest.current;
      if (current?.key !== key) return;
      offset.setValue(dy);
      const target = setDropIndex(
        keys.map((item) => layouts.current.get(item)),
        keys.indexOf(key),
        dy,
      );
      if (target !== current.target) {
        haptics.selection();
        setDrag({ key, target });
      }
    },
    [offset],
  );

  const end = useCallback(
    (key: string, canceled: boolean) => {
      const { setKeys: keys, drag: current, onMove: moveSet } = latest.current;
      offset.setValue(0);
      setDrag(null);
      if (canceled || current?.key !== key) return;
      const from = keys.indexOf(key);
      if (from >= 0 && current.target !== from) {
        haptics.success();
        moveSet(from, current.target);
      }
    },
    [offset],
  );

  return { drag, offset, measure, start, move, end };
}

/**
 * Holding a set row for half a second picks it up; moving then drags it. A quick swipe still
 * reaches the row's swipe-to-delete, and a tap still reaches its fields and buttons.
 */
export function SetDragGesture({
  enabled,
  onStart,
  onMove,
  onEnd,
  children,
}: {
  enabled: boolean;
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: (canceled: boolean) => void;
  children: ReactNode;
}) {
  const handlers = useRef({ onStart, onMove, onEnd });
  useEffect(() => {
    handlers.current = { onStart, onMove, onEnd };
  });
  const config = useMemo(
    () => ({
      enabled,
      runOnJS: true,
      activateAfterLongPress: SET_DRAG_HOLD_MS,
      onActivate: () => handlers.current.onStart(),
      onUpdate: (event: { translationY: number }) => handlers.current.onMove(event.translationY),
      onDeactivate: (event: { canceled: boolean }) => handlers.current.onEnd(event.canceled),
    }),
    [enabled],
  );
  const gesture = usePanGesture(config);
  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false}>{children}</View>
    </GestureDetector>
  );
}
