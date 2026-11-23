import { useLocalSearchParams } from 'expo-router';
import { ProfileScreen } from '../../../features/social/ProfileScreen';

/** A member's profile, or your own; `invite=1` when opened from a friend QR code. */
export default function Profile() {
  const { id, invite } = useLocalSearchParams<{ id: string; invite?: string }>();
  return <ProfileScreen key={id} profileId={id} invite={invite === '1'} />;
}
