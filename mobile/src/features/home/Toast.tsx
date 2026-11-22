import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { POPUP_MS } from '../../../../frontend/src/popupTiming';
import { palettes, useTheme } from '../../ui/theme';

export interface ToastMessage {
  message: string;
  variant?: 'info' | 'error';
  action?: { label: string; run: () => void | Promise<void> };
}

const ToastContext = createContext<(toast: ToastMessage) => void>(() => undefined);

/** Shows a brief, non-blocking confirmation above the tab bar, like the web's toasts. */
export function useToast() {
  return useContext(ToastContext);
}

/** Hosts one toast at a time over its children; a new toast replaces the one on screen. */
export function ToastHost({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastMessage & { id: number }) | null>(null);
  const nextId = useRef(0);
  const show = useCallback((next: ToastMessage) => {
    nextId.current += 1;
    setToast({ ...next, id: nextId.current });
  }, []);
  return (
    <ToastContext.Provider value={show}>
      <View style={{ flex: 1 }}>
        {children}
        {toast && <ToastView key={toast.id} toast={toast} onDone={() => setToast(null)} />}
      </View>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  const { scheme, colors, type, radius } = useTheme();
  // Drawn in the opposite palette, so it stands out from the page in light and dark mode.
  const inverse = palettes[scheme === 'dark' ? 'light' : 'dark'];
  const error = toast.variant === 'error';
  const ink = error ? colors.onAccent : inverse.text;
  const insets = useSafeAreaInsets();
  const [shown] = useState(() => new Animated.Value(0));
  const [busy, setBusy] = useState(false);
  const hide = useCallback(
    () =>
      Animated.timing(shown, { toValue: 0, duration: 160, useNativeDriver: true }).start(onDone),
    [onDone, shown],
  );
  useEffect(() => {
    Animated.timing(shown, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    // As long as the web shows it: errors stay longer, so there is time to read what went wrong.
    const timer = setTimeout(hide, POPUP_MS[error ? 'critical' : 'standard']);
    return () => {
      clearTimeout(timer);
      shown.stopAnimation();
    };
  }, [error, hide, shown]);
  // iOS draws the content under the translucent tab bar; Android's tab bar sits below it.
  const bottom = (Platform.OS === 'ios' ? insets.bottom + 56 : 0) + 12;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom,
          opacity: shown,
          transform: [
            { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          ],
        },
      ]}
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          {
            backgroundColor: error ? colors.dangerFill : inverse.surface,
            borderRadius: radius.lg,
          },
        ]}
      >
        <Text style={[type.callout, styles.message, { color: ink }]}>{toast.message}</Text>
        {toast.action && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            disabled={busy}
            hitSlop={8}
            onPress={async () => {
              setBusy(true);
              try {
                await toast.action?.run();
              } finally {
                hide();
              }
            }}
            style={({ pressed }) => (pressed || busy) && { opacity: 0.6 }}
          >
            <Text
              style={[type.callout, { color: error ? ink : inverse.accentText, fontWeight: '700' }]}
            >
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: 480,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  message: { flex: 1, fontWeight: '600' },
});
