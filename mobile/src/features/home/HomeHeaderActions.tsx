import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { profileButtonLabel } from '../../../../frontend/src/profileButton';
import { useUser } from '../../session/SessionProvider';
import { IconButton } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { ProfilePhoto } from '../../ui/ProfilePhoto';
import { useTheme } from '../../ui/theme';
import { NotificationsBell, socialRoutes } from '../social';

/**
 * Home's header buttons, as on the web: the layout pencil, the notifications bell (which counts
 * friend requests waiting for an answer), your profile, then Settings. Each is the web's 40 pt
 * square `.icon-button-pulse`.
 */
export function HomeHeaderActions({ canEdit }: { canEdit: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useUser();
  const square = [
    styles.square,
    { backgroundColor: colors.surface, borderColor: colors.line },
  ] as const;
  return (
    <View style={styles.row}>
      {/* Editing waits for the server's layout, so an older copy is never saved over a newer one. */}
      <IconButton
        icon="edit"
        accessibilityLabel="Edit Home layout"
        disabled={!canEdit}
        onPress={() => router.push('/home-layout')}
      />
      {/* Its icon is about half its size: 35 gives the 18 pt icon the other buttons use. */}
      <NotificationsBell size={35} style={square} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={profileButtonLabel(user.display_name.trim() || user.username, 0, 0)}
        hitSlop={2}
        onPress={() => {
          haptics.tap();
          router.push(socialRoutes.profile(user.id));
        }}
        style={({ pressed }) => [...square, pressed && { opacity: 0.7 }]}
      >
        <ProfilePhoto user={user} size={28} />
      </Pressable>
      <IconButton
        icon="settings"
        accessibilityLabel="Settings"
        onPress={() => router.push('/settings')}
      />
    </View>
  );
}

const SIZE = 40;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  square: {
    width: SIZE,
    height: SIZE,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
