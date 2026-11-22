import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const [shown] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const host: Host = setToast;
    hosts.push(host);
    return () => {
      hosts.splice(hosts.indexOf(host), 1);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    shown.setValue(0);
    Animated.timing(shown, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => setToast(null), toast.action ? ACTION_VISIBLE_MS : VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast, shown]);

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
      <View style={[styles.toast, { backgroundColor: colors.surface3, borderRadius: radius.pill }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${toast.message}. Dismiss`}
          onPress={() => setToast(null)}
        >
          <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
            {toast.message}
          </Text>
        </Pressable>
        {toast.action && (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              setToast(null);
              toast.action?.run();
            }}
          >
            <Text style={[type.callout, { color: colors.accentText, fontWeight: '700' }]}>
              {toast.action.label}
            </Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
