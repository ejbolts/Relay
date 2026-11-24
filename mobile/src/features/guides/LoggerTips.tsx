import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  AppState,
  Dimensions,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  hintMayShow,
  priorityTipWaiting,
  shownTipEnds,
  tipEventRequest,
  TIP_QUIET_MS,
  waitingNudge,
  type TipEnvironment,
  type TipRequest,
} from '../../../../frontend/src/tipScheduling';
import { isPriorityTip, TIP_DEFINITIONS, type TipId } from '../../../../frontend/src/tipsState';
import { useUser } from '../../session/SessionProvider';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import * as prompts from '../../ui/prompts';
import { toastShowing } from '../../ui/Toast';
import { guideIcons } from './icons';
import { tipsFor, useTips } from './tips';

/**
 * The logger's tip pop-ups, as the web's TipsProvider shows them in the logger: an event (such as
 * a first logged warm-up) asks for a nudge, which appears in a quiet moment between sets; a dot
 * beside an eligible control (the machine row) opens its tip. Tips use the account's tip state
 * on this phone (the web's format and key), so one dismissed here counts on Home's bulb and the
 * Tips page, and Show tips off stops them. Like the web's, that state stays on the device: it
 * does not follow the account to the web or another phone.
 */

const PAGE = 'log';
const TICK_MS = 500;
/** As the web's, the bottom of the screen is kept for the tab bar and docks. */
const BOTTOM_RESERVED = 75;

type Hint = { id: TipId; view: ComponentRef<typeof View> | null; visible: boolean };
type AnchorView = ComponentRef<typeof View>;

/**
 * Where a hint's control sits in the window. Tests replace `measure`, since the test renderer
 * draws no layout.
 */
export const tipAnchorLayout = {
  measure: (
    view: AnchorView,
    done: (frame: { y: number; width: number; height: number }) => void,
  ) => view.measureInWindow((_x, y, width, height) => done({ y, width, height })),
};

/** What the logger tells the tips: whether a tip may show now, and where the nudge sits. */
export type LoggerTipsEnvironment = {
  /** The logger is showing with nothing over it (a sheet, the picker or a dialog). */
  ready: boolean;
  resting: boolean;
  workoutCount: number;
  /** Where the nudge sits above the bottom edge, clear of the rest and weekly-sets docks. */
  bottom: number;
};

interface LoggerTipsApi {
  configure: (environment: LoggerTipsEnvironment) => void;
  /** Counts an event; once it has happened `threshold` times it asks for `tip`. */
  event: (name: string, tip?: TipId, threshold?: number) => void;
  /** A set was logged, which opens the moment a nudge may show in. */
  setLogged: () => void;
  /** The feature is in use, so its tip has nothing left to teach. */
  learn: (id: TipId) => void;
  /** The hint showing beside a control: its slot's key, or null. */
  hintSlot: string | null;
  registerHint: (key: string, hint: Hint) => () => void;
  /** Keeps tips away while something is going on (a drag); returns the release. */
  hold: (key: string) => () => void;
  /** Retires the showing tip. */
  dismiss: () => void;
  engage: (id: TipId) => void;
}

const noop = () => {};
const LoggerTipsContext = createContext<LoggerTipsApi>({
  configure: noop,
  event: noop,
  setLogged: noop,
  learn: noop,
  hintSlot: null,
  registerHint: () => noop,
  hold: () => noop,
  dismiss: noop,
  engage: noop,
});

export const useLoggerTips = () => useContext(LoggerTipsContext);

/** A menu or text prompt is up. (Screen tests often mock the prompts module without it.) */
const promptOpen = () =>
  typeof prompts.promptShowing === 'function' ? prompts.promptShowing() : false;

/**
 * Nothing else is going on, as the web's quiet check: no toast, menu or prompt, keyboard, app
 * switch, or anything the logger holds the tips for (such as a set being dragged).
 */
function quiet(holds: ReadonlySet<string>) {
  const app = AppState.currentState;
  return (
    holds.size === 0 &&
    !toastShowing() &&
    !promptOpen() &&
    !Keyboard.isVisible() &&
    app !== 'background' &&
    app !== 'inactive'
  );
}

export function LoggerTipsProvider({ children }: { children: ReactNode }) {
  const account = useUser().id;
  const { state } = useTips();
  const [active, setActive] = useState<{ id: TipId; slot: string | null } | null>(null);
  const environment = useRef<TipEnvironment>({
    page: PAGE,
    ready: false,
    resting: false,
    workoutCount: 0,
  });
  const [bottom, setBottom] = useState(24);
  const pending = useRef(new Map<TipId, TipRequest>());
  const hints = useRef(new Map<string, Hint>());
  const holds = useRef(new Set<string>());
  const completedSetAt = useRef(0);
  const quietSince = useRef(0);
  const shown = useRef<{ id: TipId; page: string; at: number; slot: string | null } | null>(null);

  const close = useCallback(() => {
    shown.current = null;
    setActive(null);
  }, []);

  const api = useMemo<LoggerTipsApi>(() => {
    const tips = tipsFor(account);
    return {
      configure: ({ bottom: nudgeBottom, ...next }) => {
        environment.current = { page: PAGE, ...next };
        setBottom(nudgeBottom);
      },
      event: (name, tip, threshold = 1) => {
        const { state: next, request } = tipEventRequest(
          tips.get(),
          name,
          tip,
          threshold,
          PAGE,
          Date.now(),
        );
        tips.update(() => next);
        if (tip && request) pending.current.set(tip, request);
      },
      setLogged: () => {
        completedSetAt.current = Date.now();
      },
      learn: (id) => {
        tips.learn(id);
        pending.current.delete(id);
        if (shown.current?.id === id) close();
      },
      hintSlot: null,
      registerHint: (key, hint) => {
        hints.current.set(key, hint);
        return () => {
          hints.current.delete(key);
          // Its control went (folded, removed or no longer eligible): the hint goes with it.
          if (shown.current?.slot === key) close();
        };
      },
      hold: (key) => {
        holds.current.add(key);
        return () => {
          holds.current.delete(key);
        };
      },
      dismiss: () => {
        const id = shown.current?.id;
        if (id) tips.dismiss(id);
        close();
      },
      engage: (id) => {
        tips.engage(id);
        pending.current.delete(id);
      },
    };
  }, [account, close]);

  useEffect(() => {
    const tips = tipsFor(account);
    const tick = () => {
      const now = Date.now();
      const current = environment.current;
      // Hints remember whether they were on screen at the last tick.
      const height = Dimensions.get('window').height;
      for (const hint of hints.current.values())
        if (hint.view)
          tipAnchorLayout.measure(hint.view, ({ y, width, height: h }) => {
            hint.visible = width > 0 && y >= 0 && y + h < height - BOTTOM_RESERVED;
          });
      const tipState = tips.get();
      if (!current.ready || !tipState.enabled || !quiet(holds.current)) {
        quietSince.current = 0;
        if (shown.current) close();
        return;
      }
      if (!quietSince.current) quietSince.current = now;
      if (shown.current) {
        const { id } = shown.current;
        const slot = shown.current.slot;
        // A hint whose control scrolled away or went is put away, so other tips can show.
        const anchorGone = slot !== null && !hints.current.get(slot)?.visible;
        if (anchorGone || shownTipEnds(id, shown.current, current, completedSetAt.current, now)) {
          close();
          return;
        }
        if (isPriorityTip(id) || !priorityTipWaiting(pending.current, tipState, PAGE, now)) return;
        close();
      }
      if (now - quietSince.current < TIP_QUIET_MS) return;
      const nudge = waitingNudge(pending.current, tipState, current, completedSetAt.current, now);
      const hint = [...hints.current.entries()].find(
        ([, { id, visible }]) => visible && hintMayShow(tipState, id, current, now),
      );
      const id = nudge ?? hint?.[1].id;
      if (!id) return;
      tips.shown(id, now);
      const slot = nudge ? null : (hint?.[0] ?? null);
      shown.current = { id, page: PAGE, at: now, slot };
      pending.current.delete(id);
      setActive({ id, slot });
      if (nudge) {
        const tip = TIP_DEFINITIONS[id];
        AccessibilityInfo.announceForAccessibility(`Quick tip. ${tip.title}. ${tip.body}`);
      }
    };
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [account, close]);

  // Show tips turned off (on the Tips page or the web) puts the showing tip away.
  const enabled = state.enabled;
  const visibleActive = enabled ? active : null;
  const nudge =
    visibleActive && TIP_DEFINITIONS[visibleActive.id].surface === 'nudge'
      ? visibleActive.id
      : null;
  const value = useMemo(
    () => ({
      ...api,
      hintSlot: visibleActive && !nudge ? visibleActive.slot : null,
    }),
    [api, visibleActive, nudge],
  );
  return (
    <LoggerTipsContext.Provider value={value}>
      {children}
      {nudge && <TipNudge id={nudge} bottom={bottom} onDismiss={api.dismiss} />}
    </LoggerTipsContext.Provider>
  );
}

/** The web's floating "Quick tip" card, above the bottom of the logger. */
function TipNudge({ id, bottom, onDismiss }: { id: TipId; bottom: number; onDismiss: () => void }) {
  const { colors, type, radius } = useTheme();
  const tip = TIP_DEFINITIONS[id];
  return (
    <View pointerEvents="box-none" style={[styles.nudgeDock, { bottom }]}>
      <View
        accessibilityLabel="Quick tip"
        accessibilityLiveRegion="polite"
        style={[
          styles.nudge,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.lineStrong,
            borderRadius: radius.toast,
            shadowColor: colors.shadow,
          },
        ]}
      >
        <Icon name={guideIcons.sparkle} size={20} color={colors.accentText} />
        <View style={styles.copy}>
          <Text style={[type.callout, { color: colors.text, fontWeight: '700' }]}>{tip.title}</Text>
          <Text style={[type.footnote, { color: colors.secondary }]}>{tip.body}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss tip"
          hitSlop={6}
          onPress={() => {
            haptics.tap();
            onDismiss();
          }}
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
        >
          <Icon name="close" size={16} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * A control with a tip beside it, as the web's TipSlot: while its tip is showing, a dot sits
 * beside the control and opens the tip, with Got it to put it away.
 */
export function LoggerTipSlot({
  id,
  eligible,
  children,
}: {
  id: TipId;
  eligible: boolean;
  children: ReactNode;
}) {
  const { colors, type, radius } = useTheme();
  const tips = useLoggerTips();
  const { registerHint } = tips;
  const key = useId();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!eligible) return;
    return registerHint(key, { id, view: anchor.current, visible: false });
  }, [eligible, id, key, registerHint]);
  const active = eligible && tips.hintSlot === key;
  const tip = TIP_DEFINITIONS[id];
  return (
    <View>
      {/* Only the control's row is measured: the open tip below it never counts, so opening it
          low on the screen doesn't put it away. */}
      <View ref={anchor} collapsable={false} testID="logger-tip-anchor" style={styles.slotRow}>
        <View style={styles.slotControl}>{children}</View>
        {active && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Tip: ${tip.title}`}
            accessibilityState={{ expanded: open }}
            onPress={() => {
              haptics.tap();
              if (!open) tips.engage(id);
              setOpen(!open);
            }}
            style={styles.dotTouch}
          >
            <View style={[styles.dotRing, { borderColor: `${colors.gold}80` }]}>
              <View style={[styles.dot, { backgroundColor: colors.gold }]} />
            </View>
          </Pressable>
        )}
      </View>
      {active && open && (
        <View
          accessibilityLabel={tip.title}
          style={[
            styles.popover,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.lineStrong,
              borderRadius: radius.lg,
            },
          ]}
        >
          <Text style={[type.callout, { color: colors.text, fontWeight: '700' }]}>{tip.title}</Text>
          <Text style={[type.footnote, { color: colors.secondary }]}>{tip.body}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOpen(false);
              tips.dismiss();
            }}
            style={({ pressed }) => [styles.gotIt, pressed && { opacity: 0.6 }]}
          >
            <Text style={[type.button, { color: colors.accentText }]}>Got it</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  nudgeDock: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  nudge: {
    width: '100%',
    maxWidth: 390,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  close: {
    width: 32,
    height: 32,
    marginTop: -6,
    marginRight: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotRow: { flexDirection: 'row', alignItems: 'center' },
  slotControl: { flex: 1, minWidth: 0 },
  dotTouch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dotRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  popover: { marginTop: 8, padding: 14, gap: 4, borderWidth: 1 },
  gotIt: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
