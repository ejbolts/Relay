import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '../features/settings/devicePreferences';
import { Icon } from './Icon';
import { useTheme } from './theme';

/**
 * A sheet that doesn't need its own route: a native page sheet on iOS (swipe down to close), and
 * a bottom sheet over a dimmed backdrop on Android, where tapping the backdrop closes it.
 */
export function Sheet({
  visible,
  onClose,
  title,
  kicker,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  children: ReactNode;
}) {
  const { colors, type } = useTheme();
  const reduced = useReduceMotion();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        {!!kicker && <Text style={[type.eyebrow, { color: colors.accentText }]}>{kicker}</Text>}
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
  );
  const body = (
    <ScrollView
      contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {header}
      {children}
    </ScrollView>
  );
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType={reduced ? 'none' : ios ? 'slide' : 'fade'}
      presentationStyle={ios ? 'pageSheet' : 'overFullScreen'}
      transparent={!ios}
      statusBarTranslucent={!ios}
      navigationBarTranslucent={!ios}
    >
      {ios ? (
        <View style={{ flex: 1, backgroundColor: colors.surface }}>{body}</View>
      ) : (
        <View style={styles.backdrop}>
          {/* Screen readers close with the Close button or Back, so the backdrop stays hidden. */}
          <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
          <View
            style={[styles.card, { backgroundColor: colors.surface, marginTop: insets.top + 48 }]}
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
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 20, gap: 16 },
});
