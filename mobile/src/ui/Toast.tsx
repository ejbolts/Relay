import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '../features/settings/devicePreferences';
import { Icon } from './Icon';
import { useTheme } from './theme';

// Brief, non-blocking confirmations such as "Workout saved". Any screen calls `showToast`; the
// most recently mounted <ToastHost /> shows it (a sheet mounts its own, since native sheets sit
// above the app's root view), then it clears by itself or when tapped.

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
}

export interface ToastAction {
  label: string;
  run: () => void;
}

type Host = (toast: Toast | null) => void;
const hosts: Host[] = [];
let nextId = 0;

export function showToast(message: string, action?: ToastAction) {
  const toast = { id: ++nextId, message, action };
  hosts.at(-1)?.(toast);
  AccessibilityInfo.announceForAccessibility(message);
}

const VISIBLE_MS = 3200;
/** Long enough to reach an Undo. */
const ACTION_VISIBLE_MS = 5000;

export function ToastHost({ bottom = 24 }: { bottom?: number }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, type, radius } = useTheme();
  const reduced = useReduceMotion();
  const [shown] = useState(() => new Animated.Value(0));
  // The web's timer bar along the bottom edge, shrinking until the toast clears.
  const [left] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const host: Host = setToast;
    hosts.push(host);
    return () => {
      hosts.splice(hosts.indexOf(host), 1);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    shown.setValue(reduced ? 1 : 0);
    if (!reduced) {
      Animated.timing(shown, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    }
    const ms = toast.action ? ACTION_VISIBLE_MS : VISIBLE_MS;
    left.setValue(1);
    const bar = Animated.timing(left, { toValue: 0, duration: ms, useNativeDriver: false });
    if (!reduced) bar.start();
    const timer = setTimeout(() => setToast(null), ms);
    return () => {
      bar.stop();
      clearTimeout(timer);
    };
  }, [toast, shown, left, reduced]);

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
            backgroundColor: colors.surface2,
            borderColor: colors.lineStrong,
            borderRadius: radius.toast,
            boxShadow: `0 14px 36px ${colors.shadow}`,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${toast.message}. Dismiss`}
          onPress={() => setToast(null)}
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
            onPress={() => {
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
