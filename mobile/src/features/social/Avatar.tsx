import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp } from 'react-native';
import { profileInitial } from '../../../../frontend/src/profileDisplay';
import { presenceDot, type PresenceStatus } from '../../../../frontend/src/presenceStatus';
import { apiOrigin } from '../../data/api';
import { sessionToken } from '../../data/session';
import { useTheme } from '../../ui/theme';

type Source = { uri: string; headers: Record<string, string> };

/**
 * A server image (a profile or workout photo), read with the session token: photos are only
 * served to signed-in members who can see them.
 */
export function useAuthSource(url: string | null | undefined): Source | null {
  const [source, setSource] = useState<Source | null>(null);
  useEffect(() => {
    if (!url || !apiOrigin) return;
    let cancelled = false;
    const origin = new URL(apiOrigin).origin;
    void sessionToken(origin)
      .then((token) => {
        if (cancelled || !token) return;
        setSource({
          uri: /^https?:/.test(url) ? url : origin + url,
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);
  return url ? source : null;
}

export function AuthImage({
  url,
  style,
  accessibilityLabel,
}: {
  url: string;
  style: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const source = useAuthSource(url);
  return (
    <View style={[style as object, { backgroundColor: colors.surface2, overflow: 'hidden' }]}>
      {source && (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          accessibilityLabel={accessibilityLabel}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

/** A member's photo, or their initial without one, with a dot while online or working out. */
export function Avatar({
  person,
  size = 40,
  status = null,
}: {
  person: { display_name: string; profile_photo_url?: string | null };
  size?: number;
  status?: PresenceStatus;
}) {
  const { colors } = useTheme();
  const source = useAuthSource(person.profile_photo_url);
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = !!source && failed !== source.uri;
  const dot = presenceDot(status);
  const dotSize = Math.max(10, Math.round(size * 0.28));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.accentSoft,
          },
        ]}
      >
        {showPhoto ? (
          <Image
            source={source}
            style={styles.photo}
            onError={() => setFailed(source.uri)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={{ fontSize: size * 0.42, fontWeight: '700', color: colors.accentText }}>
            {profileInitial({ ...person, username: '' })}
          </Text>
        )}
      </View>
      {dot && (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              borderColor: colors.surface,
              backgroundColor: dot === 'workout' ? colors.accent : colors.good,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  dot: { position: 'absolute', right: -1, bottom: -1, borderWidth: 2 },
});
