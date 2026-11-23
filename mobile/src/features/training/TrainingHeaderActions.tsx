import { useRouter } from 'expo-router';
import { useUser } from '../../session/SessionProvider';
import { AccountHeaderActions } from '../../ui/AccountHeaderActions';
import { NotificationsBell, socialRoutes } from '../social';

/** The web's bell, profile and Settings at the top right of Training, as on every main tab. */
export function TrainingHeaderActions() {
  const router = useRouter();
  const user = useUser();
  return (
    <AccountHeaderActions
      notifications={<NotificationsBell />}
      profile={{ user, onPress: () => router.push(socialRoutes.profile(user.id)) }}
    />
  );
}
