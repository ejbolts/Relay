import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { ReleaseVideo } from '../../../../frontend/src/releaseMetadata';
import { apiOrigin } from '../../data/api';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useReduceMotion } from '../settings/devicePreferences';
import { usePlayerError } from '../videos/usePlayerError';

/** Resolves a bundled `/releases/...` path against the server origin. */
export function releaseAssetUrl(origin: string | null, path: string): string | null {
  if (!origin) return null;
  return `${origin.replace(/\/$/, '')}${path}`;
}

/**
 * The release trailer in What's new, matching web's `ReleaseTrailer`: shows the 4:5 poster first
 * with no autoplay (regardless of reduced motion), plays with native controls at half volume and
 * looping once Play is tapped, and falls back to the poster image if playback fails.
 */
export function ReleaseTrailer({ video }: { video: ReleaseVideo }) {
  const { radius } = useTheme();
  // Nothing autoplays in either mode; Reduce Motion also turns off the posters' fade-in.
  const reducedMotion = useReduceMotion();
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  const videoUrl = releaseAssetUrl(apiOrigin, video.url);
  const posterUrl = releaseAssetUrl(apiOrigin, video.poster);
  if (!videoUrl || !posterUrl) return null;

  return (
    <View style={[styles.frame, { borderRadius: radius.lg }]} testID="release-trailer">
      {started && !failed ? (
        <TrailerPlayer
          url={videoUrl}
          posterUrl={posterUrl}
          alt={video.alt}
          reducedMotion={reducedMotion}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <Image
            source={{ uri: posterUrl }}
            accessibilityLabel={video.alt}
            accessibilityIgnoresInvertColors
            fadeDuration={reducedMotion ? 0 : undefined}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
          {!failed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play trailer: ${video.alt}`}
              onPress={() => {
                haptics.tap();
                setStarted(true);
              }}
              style={({ pressed }) => [
                StyleSheet.absoluteFill,
                styles.playOverlay,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.playCircle}>
                <Icon name="play" size={28} color="#ffffff" />
              </View>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

function TrailerPlayer({
  url,
  posterUrl,
  alt,
  reducedMotion,
  onError,
}: {
  url: string;
  posterUrl: string;
  alt: string;
  reducedMotion: boolean;
  onError: () => void;
}) {
  const [ready, setReady] = useState(false);
  const player = useVideoPlayer(url, (instance) => {
    instance.volume = 0.5;
    instance.muted = false;
    instance.loop = true;
    instance.play();
  });

  usePlayerError(player, onError);

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        testID="release-trailer-video"
        player={player}
        nativeControls
        contentFit="cover"
        surfaceType="textureView"
        allowsPictureInPicture={false}
        accessibilityLabel={alt}
        onFirstFrameRender={() => setReady(true)}
        style={StyleSheet.absoluteFill}
      />
      {!ready && (
        <Image
          testID="release-trailer-loading-poster"
          source={{ uri: posterUrl }}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no"
          accessibilityIgnoresInvertColors
          fadeDuration={reducedMotion ? 0 : undefined}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 416,
    aspectRatio: 4 / 5,
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#05070b',
  },
  playOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 7, 11, 0.22)',
  },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(5, 7, 11, 0.72)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
});
