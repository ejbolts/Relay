import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '../features/settings/devicePreferences';
import { Icon } from './Icon';
import { useTheme } from './theme';

/**
 * How much of the Android modal backdrop is obstructed by the soft keyboard, computed from the
 * backdrop's bottom in window coordinates and the keyboard's top (`screenY`). Handles full-height
 * edge-to-edge modals with three-button navigation (where `endCoordinates.height` omits the
 * system-bar inset) and already-resized windows (where `backdropBottom <= screenY`, yielding 0).
 */
export function keyboardObstruction(
  backdropBottom: number,
  keyboard: { screenY?: number; height?: number } | null | undefined,
): number {
  if (!keyboard) return 0;
  if (typeof keyboard.screenY === 'number' && Number.isFinite(keyboard.screenY)) {
    return Math.max(0, Math.round(backdropBottom - keyboard.screenY));
  }
  return Math.max(0, Math.round(keyboard.height ?? 0));
}

export const sheetBackdropLayout = {
  measure: (
    node: ComponentRef<typeof View>,
    done: (bounds: { y: number; height: number }) => void,
  ): boolean => {
    if (typeof node.measureInWindow !== 'function') return false;
    node.measureInWindow((_x, y, _width, height) => {
      done({ y, height });
    });
    return true;
  },
};

let openSheets = 0;

/** Whether any Sheet is open, so tips (as the web's) wait instead of showing behind it. */
export function sheetShowing() {
  return openSheets > 0;
}

/**
 * Counts another full-window overlay (an RN `Modal` such as a chart full screen) as an open sheet
 * while `visible`, so tips wait for it too.
 */
export function useCountAsSheet(visible: boolean) {
  useEffect(() => {
    if (!visible) return;
    openSheets += 1;
    return () => {
      openSheets -= 1;
    };
  }, [visible]);
}

/**
 * A sheet that doesn't need its own route: a native page sheet on iOS (swipe down to close), and
 * a bottom sheet over a dimmed backdrop on Android, where tapping the backdrop closes it.
 */
export function Sheet({
  visible,
  onClose,
  title,
  kicker,
  allowSwipeDismissal,
  children,
  keyboardShouldPersistTaps,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  /** Opt-in to iOS swipe-to-dismiss on the native page sheet (calls `onClose`). */
  allowSwipeDismissal?: boolean;
  children: ReactNode;
  /** 'handled' for a sheet with a search field, so the first tap on a result selects it. */
  keyboardShouldPersistTaps?: 'handled';
}) {
  const { colors, type } = useTheme();
  const reduced = useReduceMotion();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  const backdropRef = useRef<ComponentRef<typeof View>>(null);
  const keyboardCoords = useRef<{ screenY?: number; height?: number } | null>(null);
  const measureSeq = useRef(0);
  const [keyboardOverlap, setKeyboardOverlap] = useState(0);

  useCountAsSheet(visible);

  const updateOverlap = useCallback((coords: { screenY?: number; height?: number } | null) => {
    keyboardCoords.current = coords;
    const seq = ++measureSeq.current;
    if (!coords || (coords.height ?? 0) <= 0) {
      setKeyboardOverlap(0);
      return;
    }
    const node = backdropRef.current;
    if (
      !node ||
      !sheetBackdropLayout.measure(node, ({ y, height }) => {
        if (seq !== measureSeq.current || height <= 0) return;
        setKeyboardOverlap(keyboardObstruction(y + height, coords));
      })
    ) {
      setKeyboardOverlap(Math.max(0, Math.round(coords.height ?? 0)));
    }
  }, []);

  useEffect(() => {
    if (ios) return;
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      updateOverlap(event.endCoordinates);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      updateOverlap(null);
    });
    return () => {
      measureSeq.current += 1;
      show.remove();
      hide.remove();
    };
  }, [ios, updateOverlap]);
  const keyboardLift = !ios && visible ? keyboardOverlap : 0;
  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        {!!kicker && <Text style={[type.eyebrow, { color: colors.accentText }]}>{kicker}</Text>}
        <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
          {title}
        </Text>
      </View>
      {/* A 32 pt mark in a 44 pt touch area, pulled out so the mark lines up with the title. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={styles.closeTouch}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.close,
              { backgroundColor: colors.surface2 },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Icon name="close" size={15} color={colors.secondary} />
          </View>
        )}
      </Pressable>
    </View>
  );
  const body = (
    <ScrollView
      contentContainerStyle={[
        styles.body,
        { paddingBottom: keyboardLift > 0 ? 20 : Math.max(insets.bottom, 16) + 20 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
    >
      {header}
      {children}
    </ScrollView>
  );
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      allowSwipeDismissal={allowSwipeDismissal}
      animationType={reduced ? 'none' : ios ? 'slide' : 'fade'}
      presentationStyle={ios ? 'pageSheet' : 'overFullScreen'}
      transparent={!ios}
      statusBarTranslucent={!ios}
      navigationBarTranslucent={!ios}
    >
      {ios ? (
        <View style={{ flex: 1, backgroundColor: colors.surface }}>{body}</View>
      ) : (
        <View
          ref={backdropRef}
          collapsable={false}
          onLayout={() => {
            const active =
              keyboardCoords.current ??
              (typeof Keyboard.metrics === 'function' ? Keyboard.metrics() : null);
            if (active && (active.height ?? 0) > 0) updateOverlap(active);
          }}
          style={[
            styles.backdrop,
            keyboardLift > 0 && { paddingTop: insets.top + 48, paddingBottom: keyboardLift },
          ]}
        >
          {/* Screen readers close with the Close button or Back, so the backdrop stays hidden. */}
          <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                marginTop: keyboardLift > 0 ? 0 : insets.top + 48,
              },
              keyboardLift > 0 && styles.cardAboveKeyboard,
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
            {body}
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%' },
  cardAboveKeyboard: { maxHeight: '100%', flexShrink: 1 },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  closeTouch: {
    width: 44,
    height: 44,
    margin: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 20, gap: 16 },
});
