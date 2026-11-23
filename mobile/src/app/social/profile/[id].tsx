import { useLocalSearchParams } from 'expo-router';
import { ProfileScreen } from '../../../features/social/ProfileScreen';

/**
 * A member's profile, or your own; `invite=1` when opened from a friend QR code, and `workout`
 * with its `date` (yyyy-mm-dd) to open at one of their workouts.
 */
export default function Profile() {
  const { id, invite, workout, date } = useLocalSearchParams<{
    id: string;
    invite?: string;
    workout?: string;
    date?: string;
  }>();
  const target =
    workout && date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? { id: workout, workout_date: date }
      : undefined;
  return (
    <ProfileScreen
      key={`${id}:${target?.id ?? ''}`}
      profileId={id}
      invite={invite === '1'}
      targetWorkout={target}
    />
  );
}
