import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  pendingFriendRequests,
  profileBadgeText,
  profileButtonLabel,
} from '../../../../frontend/src/profileButton';
import { useUser } from '../../session/SessionProvider';
import { Icon } from '../../ui/Icon';
import { ProfilePhoto } from '../../ui/ProfilePhoto';
import { useTheme } from '../../ui/theme';
import { socialRoutes, useSharingChoices } from '../social';

const SIZE = 38;

/**
 * Home's header buttons, as on the web: your profile, badged with friend requests waiting for an
 * answer, then Settings.
 */
export function HomeHeaderActions() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useUser();
  const choices = useSharingChoices().data;
  const requests = choices ? pendingFriendRequests(choices) : 0;
  const badge = profileBadgeText(requests);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={profileButtonLabel(
          user.display_name.trim() || user.username,
          requests,
          0,
        )}
        hitSlop={6}
        onPress={() => router.push(socialRoutes.profile(user.id))}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        <ProfilePhoto user={user} size={SIZE} />
        {badge && (
          <View
            style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.page }]}
          >
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={6}
        onPress={() => router.push('/settings')}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.surface2, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Icon name="settings" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
