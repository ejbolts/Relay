import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '../features/settings/devicePreferences';
import * as sessionModule from '../session/SessionProvider';
import { Icon } from './Icon';
import { useTheme } from './theme';

// Brief, non-blocking confirmations such as "Workout saved". Any screen calls `showToast`; the
// most recently mounted <ToastHost /> shows it (a sheet mounts its own, since native sheets sit
// above the app's root view), then it clears by itself or when tapped.
//
// A toast with an action (Undo) has one lifecycle, as on the web: it stays longer, waits while it
// is touched or focused, and stays until dismissed while a screen reader is on. When it ends
// without the action (it times out, is dismissed or a newer toast replaces it), its `onDismiss`
// runs once, so a caller that defers its work (deleting a goal) commits then, never while Undo is
// still on screen. A toast belongs to the account it was shown under: when the session changes it
// disappears without running either callback, and its action never runs under another account.

export interface ToastAction {
  label: string;
  run: () => void;
  /**
   * Runs once when the toast ends without its action: timed out, dismissed, or replaced by a
   * newer toast. Commit deferred work here rather than on a timer of your own.
   */
  onDismiss?: () => void;
}

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  /** How long it shows, before any pause. */
  ms: number;
}

interface Host {
  show: (toast: Toast) => void;
  /** A longer time for a toast that is still showing (Android's accessibility timeout). */
  extend: (id: number, ms: number) => void;
}
const hosts: Host[] = [];
let nextId = 0;

const VISIBLE_MS = 3200;
/** Long enough to read the message and reach an Undo. */
const ACTION_VISIBLE_MS = 8000;

/** What a screen reader hears: the message, and the action when there is one. */
export function toastAnnouncement(message: string, action?: ToastAction) {
  return action ? `${message}. ${action.label} available.` : message;
}

export function showToast(message: string, action?: ToastAction) {
  const toast: Toast = {
    id: ++nextId,
    message,
    action,
    ms: action ? ACTION_VISIBLE_MS : VISIBLE_MS,
  };
  const host = hosts.at(-1);
  if (!host) {
    // Nowhere to show it: settle it at once, so deferred work still happens.
    action?.onDismiss?.();
    return;
  }
  host.show(toast);
  AccessibilityInfo.announceForAccessibility(toastAnnouncement(message, action));
  // Android lets people ask for more time in its accessibility settings. The host applies the
  // answer only while this toast is still the one showing.
  if (Platform.OS === 'android') {
    // Promise.resolve: a test's mock may answer without a promise.
    Promise.resolve(AccessibilityInfo.getRecommendedTimeoutMillis?.(toast.ms))
      .then((ms) => {
        if (typeof ms === 'number' && ms > toast.ms) host.extend(toast.id, ms);
      })
      .catch(() => undefined);
  }
}

// Screen tests often mock the session module with only the hooks they need, so the toast reads
// the session through whatever that module provides.
type SessionStatus = NonNullable<ReturnType<typeof sessionModule.useOptionalSession>>['status'];
const useSessionStatus: () => SessionStatus | undefined =
  typeof sessionModule.useOptionalSession === 'function'
    ? () => sessionModule.useOptionalSession()?.status
    : () => undefined;

/** The session a toast belongs to: the signed-in account, or the signed-out state. */
function useAccountKey() {
  const status = useSessionStatus();
  if (!status) return 'none';
  return status.kind === 'signed-in' ? `user:${status.user.id}` : status.kind;
}

interface Shown extends Toast {
  account: string;
}

export function ToastHost({ bottom = 24 }: { bottom?: number }) {
  const [toast, setToast] = useState<Shown | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, type, radius, scheme } = useTheme();
  const reduced = useReduceMotion();
  const account = useAccountKey();
  const [shown] = useState(() => new Animated.Value(0));
  // The web's timer bar along the bottom edge, shrinking until the toast clears.
  const [left] = useState(() => new Animated.Value(1));
  const [reader, setReader] = useState(false);
  // Press and focus hold the countdown separately, for the toast they happened on.
  const [hold, setHold] = useState({ id: -1, pressed: false, focused: false });
  const clock = useRef({ id: -1, total: 0, remaining: 0 });
  const current = useRef<Shown | null>(null);
  const accountRef = useRef(account);
  const id = toast?.id;
  const held = (hold.id === id && (hold.pressed || hold.focused)) || (reader && !!toast?.action);

  /** Ends the showing toast. Without its action, `onDismiss` runs (once); `drop` runs neither. */
  const end = (how: 'dismissed' | 'acted' | 'dropped') => {
    const ending = current.current;
    current.current = null;
    setToast(null);
    if (!ending) return;
    if (how === 'dismissed') ending.action?.onDismiss?.();
    if (how === 'acted' && ending.account === accountRef.current) ending.action?.run();
  };
  const endRef = useRef(end);

  useEffect(() => {
    endRef.current = end;
  });

  useEffect(() => {
    const host: Host = {
      show: (next) => {
        const replaced = current.current;
        const stamped = { ...next, account: accountRef.current };
        current.current = stamped;
        setToast(stamped);
        // A newer toast ends the one it replaces, as dismissing it would.
        replaced?.action?.onDismiss?.();
      },
      extend: (toastId, ms) => {
        const showing = current.current;
        if (!showing || showing.id !== toastId || ms <= showing.ms) return;
        const longer = { ...showing, ms };
        current.current = longer;
        setToast(longer);
      },
    };
    hosts.push(host);
    return () => {
      hosts.splice(hosts.indexOf(host), 1);
      // A screen's own host going away settles what it was showing.
      endRef.current('dismissed');
    };
  }, []);

  // A different account (or signing out) drops the toast without running anything.
  useEffect(() => {
    accountRef.current = account;
    if (current.current && current.current.account !== account) endRef.current('dropped');
  }, [account]);

  useEffect(() => {
    let live = true;
    // Promise.resolve: a test's mock may answer without a promise.
    Promise.resolve(AccessibilityInfo.isScreenReaderEnabled?.())
      .then((on) => {
        if (live) setReader(!!on);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('screenReaderChanged', setReader);
    return () => {
      live = false;
      subscription?.remove();
    };
  }, []);

  // A new toast slides in.
  useEffect(() => {
    if (id === undefined) return;
    shown.setValue(reduced ? 1 : 0);
    if (!reduced) {
      Animated.timing(shown, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    }
  }, [id, shown, reduced]);

  useEffect(() => {
    if (!toast) return;
    if (clock.current.id !== toast.id) {
      clock.current = { id: toast.id, total: toast.ms, remaining: toast.ms };
      left.setValue(1);
    } else if (clock.current.total !== toast.ms) {
      // A longer time arrived for the same toast (Android's accessibility timeout).
      clock.current.remaining += toast.ms - clock.current.total;
      clock.current.total = toast.ms;
    }
    if (held) return;
    const remaining = clock.current.remaining;
    const started = Date.now();
    const bar = Animated.timing(left, { toValue: 0, duration: remaining, useNativeDriver: false });
    if (!reduced) bar.start();
    const timer = setTimeout(() => endRef.current('dismissed'), remaining);
    return () => {
      bar.stop();
      clearTimeout(timer);
      clock.current.remaining = Math.max(0, remaining - (Date.now() - started));
    };
  }, [toast, held, left, reduced]);

  if (!toast) return null;
  const holding = (key: 'pressed' | 'focused', on: boolean) => () =>
    setHold((was) => ({
      id: toast.id,
      pressed: was.id === toast.id ? was.pressed : false,
      focused: was.id === toast.id ? was.focused : false,
      [key]: on,
    }));
  const holdHandlers = {
    onPressIn: holding('pressed', true),
    onPressOut: holding('pressed', false),
    onFocus: holding('focused', true),
    onBlur: holding('focused', false),
  };
  return (
    <Animated.View
      key={toast.id}
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: bottom + insets.bottom,
          opacity: shown,
          transform: [
            { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        },
      ]}
    >
      <View
        style={[
          styles.toast,
          {
            // The web's toast: the raised surface in light mode, a step up from the cards in dark.
            backgroundColor: scheme === 'light' ? colors.surfaceRaised : colors.surface2,
            borderColor: colors.lineStrong,
            borderRadius: radius.toast,
            boxShadow: `0 14px 36px ${colors.shadow}`,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${toast.message}. Dismiss`}
          {...holdHandlers}
          onPress={() => end('dismissed')}
          style={styles.message}
        >
          <Text
            numberOfLines={3}
            style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}
          >
            {toast.message}
          </Text>
          {!toast.action && (
            <View style={styles.close}>
              <Icon name="close" size={16} color={colors.muted} />
            </View>
          )}
        </Pressable>
        {toast.action && (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            {...holdHandlers}
            onPress={() => end('acted')}
            style={styles.action}
          >
            <Text style={[type.callout, { color: colors.accentText, fontWeight: '700' }]}>
              {toast.action.label}
            </Text>
          </Pressable>
        )}
        {!reduced && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.timer,
              {
                backgroundColor: colors.accent,
                width: left.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  // The web's .toast: a rounded card on the raised surface, up to 26rem wide.
  toast: {
    width: '100%',
    maxWidth: 416,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  message: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 4 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  action: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  timer: { position: 'absolute', left: 0, bottom: 0, height: 3 },
});
