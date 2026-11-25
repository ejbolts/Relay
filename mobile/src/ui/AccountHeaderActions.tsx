import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { profileBadgeText, profileButtonLabel } from '../../../frontend/src/profileButton';
import type { User } from '../../../frontend/src/types';
import { IconButton } from './components';
import { ProfilePhoto } from './ProfilePhoto';

/**
 * The web's account buttons at the top right of every main tab (AccountHeaderActions): the
 * notifications bell, your profile, then Settings, each a 40 pt rounded square in a 44 pt touch
 * area. Put it in `<Screen actions>`; a tab's own buttons (Home's Edit) go in `children`, before
 * them, as on the web.
 *
 * The bell is passed in (`notifications`), since its inbox belongs to Social: render it with
 * `<IconButton icon="bell" badge={…} />` so it matches the other two.
 */
export function AccountHeaderActions({
  notifications,
  profile,
  onSettings = () => router.push('/settings'),
  settings = true,
  children,
}: {
  notifications?: ReactNode;
  profile?: {
    user: Pick<User, 'display_name' | 'username' | 'profile_photo_url'>;
    onPress: () => void;
    /** Friend requests and feedback replies waiting, for the badge and the spoken label. */
    waiting?: { friendRequests?: number; openFeedback?: number };
  };
  onSettings?: () => void;
  /** Leave Settings out, on a screen that is already inside it. */
  settings?: boolean;
  children?: ReactNode;
}) {
  const requests = profile?.waiting?.friendRequests ?? 0;
  const feedback = profile?.waiting?.openFeedback ?? 0;
  return (
    <View style={styles.row}>
      {children}
      {notifications}
      {profile && (
        <IconButton
          accessibilityLabel={profileButtonLabel(
            profile.user.display_name.trim() || profile.user.username,
            requests,
            feedback,
          )}
          badge={profileBadgeText(requests + feedback)}
          onPress={profile.onPress}
        >
          <ProfilePhoto user={profile.user} size={30} />
        </IconButton>
      )}
      {settings && (
        <IconButton icon="settings" accessibilityLabel="Settings" onPress={onSettings} />
      )}
    </View>
  );
}

// 44 pt touch areas around 40 pt squares: a 4 pt gap leaves the web's 8 pt between the squares.
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 4 } });
