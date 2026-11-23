import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useUser } from '../../session/SessionProvider';
import { AccountHeaderActions } from '../../ui/AccountHeaderActions';
import { IconButton } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { NotificationsBell, socialRoutes } from '../social';
import { videoRoutes } from '../videos';
import { videoIcons } from '../videos/icons';

/**
 * Home's header buttons, as on the web: the layout pencil and the Video logger (for accounts that
 * can upload), then the account trio every tab shares: the bell, your profile and Settings.
 */
export function HomeHeaderActions({ canEdit }: { canEdit: boolean }) {
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const user = useUser();
  return (
    <AccountHeaderActions
      notifications={
        // Social's bell is still round; drawn here as the shared 40 pt square until it is an
        // IconButton itself. Its icon is about half its size: 35 gives the 18 pt icon.
        <View style={styles.touch}>
          <NotificationsBell
            size={35}
            style={[
              styles.square,
              {
                backgroundColor: colors.surface,
                borderColor: scheme === 'light' ? colors.lineStrong : colors.line,
              },
            ]}
          />
        </View>
      }
      profile={{ user, onPress: () => router.push(socialRoutes.profile(user.id)) }}
      onSettings={() => router.push('/settings')}
    >
      {/* Editing waits for the server's layout, so an older copy is never saved over a newer one. */}
      <IconButton
        icon="edit"
        accessibilityLabel="Edit Home layout"
        disabled={!canEdit}
        onPress={() => router.push('/home-layout')}
      />
      {user.can_upload_videos !== false && (
        <IconButton
          icon={videoIcons.video}
          accessibilityLabel="Video logger"
          onPress={() => router.push(videoRoutes.videos)}
        />
      )}
    </AccountHeaderActions>
  );
}

const styles = StyleSheet.create({
  touch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  square: { width: 40, height: 40, borderRadius: 12, borderWidth: 1 },
});
