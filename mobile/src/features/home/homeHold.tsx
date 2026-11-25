import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { TextInput, View, type ViewInstance } from 'react-native';
import {
  GestureDetector,
  GestureStateManager,
  useLongPressGesture,
} from 'react-native-gesture-handler';

interface HoldExemptions {
  add: (view: { current: ViewInstance | null }) => () => void;
}

const HoldExemptContext = createContext<HoldExemptions | null>(null);

/**
 * One Home card that opens Edit Home after a stationary half-second hold, like the web's
 * `useHomeLongPress`. The hold fails as the finger lands, before it could cancel anything, when
 * a text field is focused or the touch starts inside a `HomeHoldExempt` area (editable fields
 * and controls with their own long press). A successful hold still cancels the card's own touch,
 * so releasing it never also presses what was under the finger.
 */
export function HoldableCard({
  onHold,
  testID,
  children,
}: {
  onHold?: () => void;
  testID?: string;
  children: ReactNode;
}) {
  const containerRef = useRef<ViewInstance>(null);
  const exempt = useRef(new Set<{ current: ViewInstance | null }>());
  const onHoldRef = useRef(onHold);
  useEffect(() => {
    onHoldRef.current = onHold;
  });
  const exemptions = useMemo<HoldExemptions>(
    () => ({
      add: (view) => {
        exempt.current.add(view);
        return () => exempt.current.delete(view);
      },
    }),
    [],
  );
  const hold = useLongPressGesture({
    enabled: Boolean(onHold),
    minDuration: 500,
    maxDistance: 10,
    numberOfPointers: 1,
    runOnJS: true,
    cancelsTouchesInView: true,
    cancelsJSResponder: true,
    onTouchesDown: (event) => {
      const fail = () => GestureStateManager.fail(event.handlerTag);
      if (TextInput.State.currentlyFocusedInput() != null) return fail();
      const touch = event.allTouches[0];
      const container = containerRef.current;
      if (!touch || !container) return;
      for (const view of exempt.current) {
        view.current?.measureLayout(container, (x, y, width, height) => {
          if (touch.x >= x && touch.x <= x + width && touch.y >= y && touch.y <= y + height) {
            fail();
          }
        });
      }
    },
    onActivate: () => {
      // A field can gain focus during the hold; leave its selection and paste alone.
      if (TextInput.State.currentlyFocusedInput() != null) return;
      onHoldRef.current?.();
    },
  });
  return (
    <HoldExemptContext.Provider value={exemptions}>
      <GestureDetector gesture={hold}>
        <View ref={containerRef} collapsable={false} testID={testID}>
          {children}
        </View>
      </GestureDetector>
    </HoldExemptContext.Provider>
  );
}

/** An area of a Home card where a hold belongs to the control, not to Edit Home. */
export function HomeHoldExempt({ children }: { children: ReactNode }) {
  const exemptions = useContext(HoldExemptContext);
  const ref = useRef<ViewInstance>(null);
  useEffect(() => exemptions?.add(ref), [exemptions]);
  return (
    <View ref={ref} collapsable={false} testID="home-hold-exempt">
      {children}
    </View>
  );
}
