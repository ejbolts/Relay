import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type {
  CoachStepPlan,
  CoachTarget as CoachTargetId,
} from '../../../../frontend/src/setupGuideCoach';
import { useReduceMotion } from '../settings/devicePreferences';
import { keyboardObstruction } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { GuideCard, GuideText } from './GuideCard';

/**
 * A setup guide's coaching inside a feature's own screen, as the web's coach: the current step
 * as a guide card docked at the bottom of the screen (or inside a sheet), and the control the step
 * is about highlighted with the accent ring. The person uses the real control to move on; Next
 * appears where the web has it. The grabber folds the card to its title and Next.
 */

// The highlighted control, the coach's height and the marked controls, shared with headers,
// which render outside the screen's own tree.
// Each is owned by the coach that set it, so a coach leaving never clears another's.
let highlighted: { owner: object; target: CoachTargetId } | null = null;
let docked: { owner: object; height: number } | null = null;
const listeners = new Set<() => void>();
const targets = new Map<CoachTargetId, { view: ComponentRef<typeof View>; header: boolean }>();

// Asks the coach to bring the highlighted control into view, such as when it appears late.
const revealListeners = new Set<(target: CoachTargetId) => void>();
function requestReveal(target: CoachTargetId) {
  if (highlighted?.target === target) for (const listener of revealListeners) listener(target);
}

function emit() {
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The control the current coach step is about, for tests. */
export const coachHighlight = () => highlighted?.target ?? null;

/**
 * Marks a control a coach step can be about. While that step shows, the control gets the accent
 * ring (pulsing unless motion is reduced). `id` is left out when this copy isn't the one meant,
 * such as another split's button. `header` marks a header button, which needs no scrolling.
 */
export function CoachTarget({
  id,
  header = false,
  radius = 14,
  style,
  children,
}: {
  id?: CoachTargetId | false | null;
  header?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const on = useSyncExternalStore(subscribe, () => !!id && highlighted?.target === id);
  const ref = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    const view = ref.current;
    if (!id || !view) return;
    targets.set(id, { view, header });
    requestReveal(id);
    return () => {
      if (targets.get(id)?.view === view) targets.delete(id);
    };
  }, [id, header]);
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[header && styles.header, style]}
      onLayout={id ? () => requestReveal(id) : undefined}
    >
      {children}
      {on && <TargetRing radius={radius} inset={header ? 0 : 3} />}
    </View>
  );
}

/** The ring sits `inset` outside the control; a header button's ring stays inside the header. */
function TargetRing({ radius, inset }: { radius: number; inset: number }) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [pulse, reduced]);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {!reduced && (
        <Animated.View
          style={[
            styles.ring,
            {
              top: -inset,
              right: -inset,
              bottom: -inset,
              left: -inset,
              borderRadius: radius + inset,
              borderColor: colors.accent,
              opacity: pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.7, 0, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
              ],
            },
          ]}
        />
      )}
      <View
        style={[
          styles.ring,
          {
            top: -inset,
            right: -inset,
            bottom: -inset,
            left: -inset,
            borderRadius: radius + inset,
            borderColor: colors.accent,
          },
        ]}
      />
    </View>
  );
}

/** Room at the end of a screen's scrolling content, so its last controls scroll above the coach. */
export function CoachSpacer() {
  const height = useSyncExternalStore(subscribe, () => docked?.height ?? 0);
  return height ? <View style={{ height }} /> : null;
}

type Measurable = {
  measureInWindow?: (done: (x: number, y: number, width: number, height: number) => void) => void;
};
type Box = { y: number; height: number } | null;
/** Window measurements for bringing a control into view; replaceable in tests. */
export const coachLayout = {
  measure: (
    view: Measurable | null | undefined,
    // What is measured, for tests.
    _part: 'frame' | 'content' | 'control' | 'coach',
  ) =>
    new Promise<Box>((resolve) => {
      if (!view || typeof view.measureInWindow !== 'function') return resolve(null);
      view.measureInWindow((_x, y, _width, height) => resolve({ y, height }));
    }),
};

export function GuideCoach({
  step,
  index,
  total,
  onNext,
  onBack,
  onExit,
  scroll,
  inline = false,
}: {
  step: CoachStepPlan;
  index: number;
  total: number;
  /** Moves to the following step; shown when the step has a Next. */
  onNext?: () => void;
  /** Returns to the previous step on this screen; left out on a screen's first step. */
  onBack?: () => void;
  onExit: () => void;
  /** The screen's scroll view, to bring the control into view above the coach. */
  scroll?: RefObject<ComponentRef<typeof ScrollView> | null>;
  /** Inside a sheet, in its flow above the sheet's main action, rather than docked. */
  inline?: boolean;
}) {
  const { colors, radius, scheme } = useTheme();
  // Optional, so screens rendered without a safe-area provider (tests) still work.
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const reduced = useReduceMotion();
  const card = useRef<ComponentRef<typeof View>>(null);
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [lift, setLift] = useState(0);
  // Folding lasts for its step only: each new step opens again, as on the web.
  const [foldedAt, setFoldedAt] = useState<number | null>(null);
  const folded = foldedAt === index;
  const { target, title } = step;
  const [me] = useState(() => ({}));

  useEffect(() => {
    highlighted = { owner: me, target };
    emit();
    return () => {
      if (highlighted?.owner === me) {
        highlighted = null;
        emit();
      }
    };
  }, [me, target]);

  useEffect(() => {
    // Android reads the title's live region; iOS hears the new step announced.
    if (Platform.OS === 'ios')
      AccessibilityInfo.announceForAccessibility(`Setup guide, ${index + 1} of ${total}. ${title}`);
  }, [index, total, title]);

  // Stays clear of the keyboard: lifted by however much of it covers the screen's bottom.
  useEffect(() => {
    if (inline) return;
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      anchor.current?.measureInWindow((_x, y, _width, height) =>
        setLift(keyboardObstruction(y + height, event.endCoordinates)),
      );
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setLift(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [inline]);

  useEffect(
    () => () => {
      if (docked?.owner !== me) return;
      docked = null;
      emit();
    },
    [me],
  );

  // Brings the control into view above the coach once the screen has laid out, again a moment
  // later in case loading content moved it, and whenever the control itself appears or moves.
  // Each pass measures afresh, a newer pass cancels an older one still measuring, and a pass
  // with nothing to move does nothing.
  useEffect(() => {
    if (inline || !scroll) return;
    let live = true;
    let latest = 0;
    let soon: ReturnType<typeof setTimeout> | undefined;
    const reveal = async () => {
      const pass = ++latest;
      const marked = targets.get(target);
      const scroller = scroll.current;
      if (!marked || marked.header || !scroller) return;
      const [frame, content, control, coach] = await Promise.all([
        coachLayout.measure(scroller as Measurable, 'frame'),
        coachLayout.measure(scroller.getInnerViewRef?.() as Measurable | null, 'content'),
        coachLayout.measure(marked.view, 'control'),
        coachLayout.measure(card.current, 'coach'),
      ]);
      if (!live || pass !== latest || !frame || !content || !control) return;
      const top = frame.y + 8;
      const bottom = Math.min(frame.y + frame.height, coach?.y ?? Infinity) - 16;
      const end = control.y + control.height;
      let delta = 0;
      if (end > bottom) delta = Math.min(end - bottom, control.y - top);
      else if (control.y < top) delta = control.y - top;
      if (Math.abs(delta) < 4) return;
      scroller.scrollTo({ y: Math.max(0, frame.y - content.y + delta), animated: !reduced });
    };
    const timers = [350, 1100].map((delay) => setTimeout(() => void reveal(), delay));
    const listener = (asked: CoachTargetId) => {
      if (asked !== target) return;
      clearTimeout(soon);
      soon = setTimeout(() => void reveal(), 120);
    };
    revealListeners.add(listener);
    return () => {
      live = false;
      timers.forEach(clearTimeout);
      clearTimeout(soon);
      revealListeners.delete(listener);
    };
  }, [inline, scroll, target, reduced]);

  // Tapping the grabber folds or opens the card; swiping it down folds it and up opens it. The
  // 40 x 5 pt bar sits in a 44 pt band that answers touches, and screen readers activate it.
  const pressY = useRef<number | null>(null);
  const swiped = useRef(false);
  const toggle = () => setFoldedAt(folded ? null : index);
  const handle = inline ? undefined : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={folded ? 'Show guide' : 'Minimise guide'}
      accessibilityState={{ expanded: !folded }}
      pressRetentionOffset={{ top: 80, bottom: 80, left: 40, right: 40 }}
      onPressIn={(event) => {
        pressY.current = event.nativeEvent.pageY;
        swiped.current = false;
      }}
      onPressOut={(event) => {
        const start = pressY.current;
        pressY.current = null;
        if (start === null) return;
        const moved = event.nativeEvent.pageY - start;
        if (moved > 16) setFoldedAt(index);
        else if (moved < -16) setFoldedAt(null);
        else return;
        swiped.current = true;
      }}
      onPress={() => {
        if (swiped.current) swiped.current = false;
        else toggle();
      }}
      style={styles.handle}
    >
      <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
    </Pressable>
  );

  const body = (
    <GuideCard
      guide="Setup guide"
      index={index}
      total={total}
      title={title}
      onBack={onBack}
      next={step.next && onNext && { disabled: step.next.disabled, onPress: onNext }}
      onLeave={onExit}
      folded={folded}
      handle={handle}
    >
      <GuideText>{step.body}</GuideText>
    </GuideCard>
  );

  if (inline)
    return (
      <View
        accessibilityLabel="Setup guide"
        style={[
          styles.inline,
          { borderColor: colors.accent, backgroundColor: colors.surface, borderRadius: radius.lg },
        ]}
      >
        {body}
      </View>
    );

  return (
    <>
      <View ref={anchor} pointerEvents="none" style={styles.anchor} />
      <View
        ref={card}
        accessibilityLabel="Setup guide"
        onLayout={(event) => {
          const height = Math.round(event.nativeEvent.layout.height) + 12;
          if (docked?.owner !== me || docked.height !== height) {
            docked = { owner: me, height };
            emit();
          }
        }}
        style={[
          styles.docked,
          {
            bottom: lift > 0 ? lift + 8 : Math.max(12, bottomInset + 8),
            backgroundColor: scheme === 'light' ? colors.surfaceRaised : colors.surface2,
            borderColor: colors.lineStrong,
            borderRadius: radius.sheet - 8,
            boxShadow: `0 12px 32px ${colors.shadow}`,
          },
        ]}
      >
        {body}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 2 },
  // Room for the ring inside the header, which clips anything outside its bar.
  header: { paddingHorizontal: 6, paddingVertical: 2 },
  anchor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 0 },
  docked: {
    position: 'absolute',
    left: 12,
    right: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderWidth: 1,
  },
  inline: { padding: 16, borderWidth: 1.5 },
  handle: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    // The band takes the place of the card's gap below it.
    marginBottom: -12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3 },
});
