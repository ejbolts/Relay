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
import { Icon } from './Icon';
import { useTheme } from './theme';

// Brief, non-blocking confirmations such as "Workout saved". Any screen calls `showToast`; the
// most recently mounted <ToastHost /> shows it (a sheet mounts its own, since native sheets sit
// above the app's root view), then it clears by itself or when tapped. A toast with an action
// (Undo) stays longer, waits while someone is touching or focused on it, and stays until it is
// dismissed while a screen reader is on, so the action can always be reached.

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  /** How long it shows, before any pause. */
  ms: number;
}

export interface ToastAction {
  label: string;
  run: () => void;
}

type Host = (toast: Toast | null) => void;
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
  host?.(toast);
  AccessibilityInfo.announceForAccessibility(toastAnnouncement(message, action));
  // Android lets people ask for more time in its accessibility settings.
  if (Platform.OS === 'android' && host) {
    Promise.resolve(AccessibilityInfo.getRecommendedTimeoutMillis?.(toast.ms))
      .then((ms) => {
        if (typeof ms === 'number' && ms > toast.ms) host({ ...toast, ms });
      })
      .catch(() => undefined);
  }
}

export function ToastHost({ bottom = 24 }: { bottom?: number }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, type, radius, scheme } = useTheme();
  const reduced = useReduceMotion();
  const [shown] = useState(() => new Animated.Value(0));
  // The web's timer bar along the bottom edge, shrinking until the toast clears.
  const [left] = useState(() => new Animated.Value(1));
  const [reader, setReader] = useState(false);
  const [touched, setTouched] = useState(false);
  const clock = useRef({ id: -1, total: 0, remaining: 0 });
  const id = toast?.id;
  // The countdown waits while it's being touched or focused, and for a screen reader user an
  // action toast waits until it is dismissed.
  const held = touched || (reader && !!toast?.action);

  useEffect(() => {
    const host: Host = setToast;
    hosts.push(host);
    return () => {
      hosts.splice(hosts.indexOf(host), 1);
    };
  }, []);

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
    const timer = setTimeout(() => setToast(null), remaining);
    return () => {
      bar.stop();
      clearTimeout(timer);
      clock.current.remaining = Math.max(0, remaining - (Date.now() - started));
    };
  }, [toast, held, left, reduced]);

  const hold = {
    onPressIn: () => setTouched(true),
    onPressOut: () => setTouched(false),
    onFocus: () => setTouched(true),
    onBlur: () => setTouched(false),
  };

  if (!toast) return null;
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
          {...hold}
          onPress={() => {
            setTouched(false);
            setToast(null);
          }}
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
            {...hold}
            onPress={() => {
              setTouched(false);
              setToast(null);
              toast.action?.run();
            }}
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
