import { useRouter } from 'expo-router';
import { canUploadVideos } from '../../../../frontend/src/videoAccess';
import { useUser } from '../../session/SessionProvider';
import { AccountHeaderActions } from '../../ui/AccountHeaderActions';
import { IconButton } from '../../ui/components';
import { NotificationsBell, socialRoutes } from '../social';
import { videoRoutes } from '../videos';
import { videoIcons } from '../videos/icons';

/**
 * Home's header buttons, as on the web: the layout pencil and the Video logger (for accounts that
 * can upload), then the account trio every tab shares: the bell, your profile and Settings.
 */
export function HomeHeaderActions({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const user = useUser();
  return (
    <AccountHeaderActions
      notifications={<NotificationsBell />}
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
      {canUploadVideos(user) && (
        <IconButton
          icon={videoIcons.video}
          accessibilityLabel="Video logger"
          onPress={() => router.push(videoRoutes.videos)}
        />
      )}
    </AccountHeaderActions>
  );
}
