import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '../../ui/theme';

/**
 * Native preview of a picked workout clip before uploading, matching the web's muted inline
 * `<video controls muted playsInline preload="metadata">` element without autoplaying.
 */
export function ClipPreview({ uri, name }: { uri: string; name: string }) {
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
  const player = useVideoPlayer(uri, (instance) => {
    instance.muted = true;
    instance.loop = false;
  });

  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onError();
    });
    return () => subscription.remove();
  }, [player, onError]);

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
  fallback: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
