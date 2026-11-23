import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { profileInitial } from '../../../../frontend/src/profileDisplay';
import type { User } from '../../../../frontend/src/types';
import { apiOrigin } from '../../data/api';
import { sessionToken } from '../../data/session';
import { useTheme } from '../../ui/theme';

// Photos by URL, as data URIs. Each upload has a new URL, so a cached one never goes stale.
const loaded = new Map<string, Promise<string | null>>();

/**
 * Reads a signed-in image as a data URI. The server shows a profile photo only to its owner, and
 * Android's <Image> drops the bearer header of an image request (the server then answers 401), so
 * the photo is read with React Native's XMLHttpRequest, which sends it.
 */
function loadAccountImage(url: string): Promise<string | null> {
  const cached = loaded.get(url);
  if (cached) return cached;
  const promise = (async () => {
    const origin = new URL(apiOrigin!).origin;
    const token = await sessionToken(origin);
    if (!token) return null;
    return new Promise<string | null>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', /^https?:/.test(url) ? url : origin + url);
      xhr.responseType = 'blob';
      xhr.timeout = 15_000;
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onerror = xhr.ontimeout = () => resolve(null);
      xhr.onload = () => {
        if (xhr.status !== 200) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(xhr.response);
      };
      xhr.send();
    });
  })();
  loaded.set(url, promise);
  // A failure is tried again next time rather than remembered.
  void promise.then((result) => {
    if (!result) loaded.delete(url);
  });
  return promise;
}

/**
 * The account's photo, or its initial without one. `preview` shows a photo picked on this phone
 * before it is saved; `hidden` shows the initial, as when the photo is about to be removed.
 */
export function ProfilePhoto({
  user,
  size,
  preview,
  hidden,
}: {
  user: Pick<User, 'display_name' | 'username' | 'profile_photo_url'>;
  size: number;
  preview?: string | null;
  hidden?: boolean;
}) {
  const { colors } = useTheme();
  const url = hidden || !apiOrigin ? null : (user.profile_photo_url ?? null);
  const [photo, setPhoto] = useState<{ url: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void loadAccountImage(url).then((uri) => {
      if (!cancelled) setPhoto({ url, uri });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  const uri = preview ?? (url && photo?.url === url ? photo.uri : null);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: colors.accent,
          backgroundColor: colors.accentSoft,
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.photo} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: colors.accentText }}>
          {profileInitial(user)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
});
