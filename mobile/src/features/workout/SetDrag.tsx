import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { haptics } from '../../ui/haptics';

/**
 * How long a finger rests on a set before it picks up, as the web's set handle. A hold on a number
 * field stays the system's text selection (Android's field claims it first), so a set picks up
 * from its number, RPE, tick or the space between them.
 */
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
 * dragged block follows the finger and the place it will drop into is marked; set numbers,
 * types and rests follow the sets once it drops, since they belong to each set.
 *
 * The drag in progress lives in a ref that the gesture callbacks update at once, so a release
 * arriving in the same batch as the last move drops where the finger was; state only draws the
 * marker. The drop names the set and the set whose place it takes by key, so a set removed or
 * moved meanwhile (on another device, say) cancels the move instead of moving the wrong set.
 */
export function useSetDrag(setKeys: string[], onDrop: (setKey: string, targetKey: string) => void) {
  const [drag, setDrag] = useState<{ key: string; target: number } | null>(null);
  // The set being dragged was deleted (on another device, say): its row and gesture went with it,
  // so no release will come. The drag ends here, which also lets the tips go again; the ref's
  // leftover entry is ignored, as move and release check the set is still there.
  if (drag && !setKeys.includes(drag.key)) setDrag(null);
  const [offset] = useState(() => new Animated.Value(0));
  const layouts = useRef(new Map<string, SetBlock>());
  const active = useRef<{ key: string; target: number; targetKey: string } | null>(null);
  const latest = useRef({ setKeys, onDrop });
  useEffect(() => {
    latest.current = { setKeys, onDrop };
  });

  const measure = useCallback((key: string, block: SetBlock) => {
    layouts.current.set(key, block);
  }, []);

  const cancel = useCallback(() => {
    active.current = null;
    offset.setValue(0);
    setDrag(null);
  }, [offset]);

  const start = useCallback(
    (key: string) => {
      const from = latest.current.setKeys.indexOf(key);
      if (from < 0) return;
      offset.setValue(0);
      haptics.press();
      active.current = { key, target: from, targetKey: key };
      setDrag({ key, target: from });
    },
    [offset],
  );

  const move = useCallback(
    (key: string, dy: number) => {
      const current = active.current;
      if (current?.key !== key) return;
      const keys = latest.current.setKeys;
      const from = keys.indexOf(key);
      // The set went away mid-drag (deleted on another device): nothing is left to move.
      if (from < 0) {
        cancel();
        return;
      }
      offset.setValue(dy);
      const target = setDropIndex(
        keys.map((item) => layouts.current.get(item)),
        from,
        dy,
      );
      if (target !== current.target) {
        haptics.selection();
        active.current = { key, target, targetKey: keys[target] };
        setDrag({ key, target });
      }
    },
    [offset, cancel],
  );

  const end = useCallback(
    (key: string, canceled: boolean) => {
      const current = active.current;
      if (current?.key !== key) return;
      cancel();
      if (canceled || current.targetKey === key) return;
      const keys = latest.current.setKeys;
      if (!keys.includes(key) || !keys.includes(current.targetKey)) return;
      haptics.success();
      latest.current.onDrop(key, current.targetKey);
    },
    [cancel],
  );

  return { drag, offset, measure, start, move, end };
}

/**
 * Holding a set row for half a second picks it up; moving then drags it. A quick swipe still
 * reaches the row's swipe-to-delete, a tap still reaches its fields and buttons, and moving before
 * the hold ends scrolls the logger as usual.
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
