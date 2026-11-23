import { Image, StyleSheet, Text, View } from 'react-native';
import { profileInitial } from '../../../frontend/src/profileDisplay';
import type { User } from '../../../frontend/src/types';
import { apiOrigin } from '../data/api';
import { useAuthorisedImage } from '../data/authorisedImage';
import { useTheme } from './theme';

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
  const saved = useAuthorisedImage(url);
  const uri = preview ?? saved;
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
