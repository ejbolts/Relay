import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { profileButtonLabel } from '../../../../frontend/src/profileButton';
import { useUser } from '../../session/SessionProvider';
import { Icon } from '../../ui/Icon';
import { ProfilePhoto } from '../../ui/ProfilePhoto';
import { useTheme } from '../../ui/theme';
import { NotificationsBell, socialRoutes } from '../social';
import { VideosButton } from '../videos';

const SIZE = 38;

/**
 * Home's header buttons, as on the web: the Video logger (for accounts that can upload), the
 * notifications bell (which counts friend requests waiting for an answer), your profile, then
 * Settings.
 */
export function HomeHeaderActions() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useUser();
  return (
    <View style={styles.row}>
      <VideosButton size={SIZE} />
      <NotificationsBell size={SIZE} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={profileButtonLabel(user.display_name.trim() || user.username, 0, 0)}
        hitSlop={6}
        onPress={() => router.push(socialRoutes.profile(user.id))}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        <ProfilePhoto user={user} size={SIZE} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={6}
        onPress={() => router.push('/settings')}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.surface2, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Icon name="settings" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
