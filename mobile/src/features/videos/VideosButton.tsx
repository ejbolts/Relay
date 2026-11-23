import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useUser } from '../../session/SessionProvider';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { videoIcons } from './icons';
import { videoRoutes } from './routes';

/** Home header's Video logger button, as on the web; hidden when the account can't upload. */
export function VideosButton() {
  const user = useUser();
  const router = useRouter();
  const { colors } = useTheme();
  if (user.can_upload_videos === false) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Video logger"
      hitSlop={8}
      onPress={() => router.push(videoRoutes.videos)}
    >
      <Icon name={videoIcons.video} size={22} color={colors.accentText} />
    </Pressable>
  );
}
