import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useUser } from '../../session/SessionProvider';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { videoIcons } from './icons';
import { videoRoutes } from './routes';

/** Home header's Video logger button, as on the web; hidden when the account can't upload. */
export function VideosButton({ size = 38 }: { size?: number }) {
  const user = useUser();
  const router = useRouter();
  const { colors } = useTheme();
  if (user.can_upload_videos === false) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Video logger"
      hitSlop={6}
      onPress={() => router.push(videoRoutes.videos)}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        { backgroundColor: colors.surface2, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={videoIcons.video} size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
});
