import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { usePlayerError } from './usePlayerError';

/**
 * Preview of a picked workout clip before uploading, like the web's muted inline
 * `<video controls muted playsInline>`. A batch can hold many clips and each native player
 * prepares its video as soon as it exists, so a clip gets a player only once its preview is
 * opened, and the screen keeps one open at a time (`active`).
 */
export function ClipPreview({
  uri,
  name,
  active,
  onOpen,
}: {
  uri: string;
  name: string;
  active: boolean;
  onOpen: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View
        style={[styles.fallback, { backgroundColor: colors.surface2, borderRadius: radius.md }]}
      >
        <Text style={[type.footnote, { color: colors.muted }]}>Preview unavailable</Text>
      </View>
    );
  }

  if (!active) {
    return (
      <Pressable
        testID={`clip-preview-open-${name}`}
        accessibilityRole="button"
        accessibilityLabel={`Preview ${name}`}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.frame,
          styles.closed,
          { borderRadius: radius.md },
          pressed && { opacity: 0.8 },
        ]}
      >
        <View style={styles.playCircle}>
          <Icon name="play" size={24} color="#ffffff" />
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.frame, { borderRadius: radius.md }]}>
      <ClipVideoPlayer uri={uri} name={name} onError={() => setFailed(true)} />
    </View>
  );
}

function ClipVideoPlayer({
  uri,
  name,
  onError,
}: {
  uri: string;
  name: string;
  onError: () => void;
}) {
  // Opened by a tap, so it starts playing, muted as on the web.
  const player = useVideoPlayer(uri, (instance) => {
    instance.muted = true;
    instance.loop = false;
    instance.play();
  });
  usePlayerError(player, onError);

  return (
    <VideoView
      testID={`clip-preview-${name}`}
      player={player}
      nativeControls
      contentFit="contain"
      surfaceType="textureView"
      allowsPictureInPicture={false}
      accessibilityLabel={`Preview ${name}`}
      style={StyleSheet.absoluteFill}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
    backgroundColor: '#05070b',
  },
  closed: { alignItems: 'center', justifyContent: 'center' },
  playCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  fallback: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
