import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { ToastHost } from '../../ui/Toast';

/**
 * Home's sheets: a native page sheet on iOS, a bottom sheet over a dimmed backdrop on Android.
 * Like `ui/Sheet`, plus `onDismiss`, so a button can open the logger or another sheet once this
 * one has gone (iOS can't present one while a page sheet is still leaving).
 */
export function HomeSheet({
  visible,
  onClose,
  onDismiss,
  kicker,
  kickerColor,
  title,
  toasts = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  kicker?: string;
  /** A dot before the kicker, such as a planned day's workout type colour. */
  kickerColor?: string | null;
  title: string;
  /** Shows confirmations inside the sheet, which covers the app's own toasts on iOS. */
  toasts?: boolean;
  children: ReactNode;
}) {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  const body = (
    <ScrollView
      contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          {!!kicker && (
            <View style={styles.kicker}>
              {!!kickerColor && <View style={[styles.dot, { backgroundColor: kickerColor }]} />}
              <Text style={[type.eyebrow, { color: colors.accentText }]}>{kicker}</Text>
            </View>
          )}
          <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
            {title}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          onPress={onClose}
          style={({ pressed }) => [
            styles.close,
            { backgroundColor: colors.surface2 },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Icon name="close" size={14} color={colors.secondary} />
        </Pressable>
      </View>
      {children}
    </ScrollView>
  );
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      onDismiss={onDismiss}
      animationType={ios ? 'slide' : 'fade'}
      presentationStyle={ios ? 'pageSheet' : 'overFullScreen'}
      transparent={!ios}
      statusBarTranslucent={!ios}
      navigationBarTranslucent={!ios}
    >
      {ios ? (
        <View style={{ flex: 1, backgroundColor: colors.surface }}>
          {body}
          {toasts && <ToastHost />}
        </View>
      ) : (
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
          <View
            style={[styles.card, { backgroundColor: colors.surface, marginTop: insets.top + 48 }]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
            {body}
          </View>
          {toasts && <ToastHost />}
        </View>
      )}
    </Modal>
  );
}

/** Longer than a page sheet takes to leave, in case its dismissal is never reported. */
const DISMISS_FALLBACK_MS = 800;

/**
 * Closes a sheet, then runs the next step: on iOS once the sheet has been dismissed (pass
 * `onDismiss` to the sheet), elsewhere at once.
 */
export function useCloseThen(onClose: () => void) {
  const pending = useRef<(() => void) | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onDismiss = useCallback(() => {
    clearTimeout(fallback.current);
    const action = pending.current;
    pending.current = null;
    action?.();
  }, []);
  const closeThen = useCallback(
    (action: () => void) => {
      pending.current = action;
      onClose();
      if (Platform.OS !== 'ios') onDismiss();
      else fallback.current = setTimeout(onDismiss, DISMISS_FALLBACK_MS);
    },
    [onClose, onDismiss],
  );
  useEffect(() => () => clearTimeout(fallback.current), []);
  return { closeThen, onDismiss };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  card: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 20, gap: 16 },
});
