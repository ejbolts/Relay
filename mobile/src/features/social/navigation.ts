import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useUser } from '../../session/SessionProvider';

/** Social's screens, pushed over the tabs so Home and Social open them the same way. */
export const socialRoutes = {
  profile: (id: string, invite = false) =>
    ({
      pathname: '/social/profile/[id]',
      params: invite ? { id, invite: '1' } : { id },
    }) as const,
  workout: (workout: { id: string; memberId: string; date: string; comments?: boolean }) =>
    ({
      pathname: '/social/workout/[id]',
      params: {
        id: workout.id,
        member: workout.memberId,
        date: workout.date,
        ...(workout.comments ? { comments: '1' } : {}),
      },
    }) as const,
  sharing: '/social/sharing' as const,
  tab: '/social' as const,
};

/** Opens people and workouts from any screen. */
export function useSocialNavigation() {
  const router = useRouter();
  const me = useUser().id;
  const openProfile = useCallback(
    (person: { id: string }) => router.push(socialRoutes.profile(person.id)),
    [router],
  );
  const openWorkout = useCallback(
    (workout: { id: string; memberId: string; date: string; comments?: boolean }) =>
      router.push(socialRoutes.workout(workout)),
    [router],
  );
  const openSharing = useCallback(() => router.push(socialRoutes.sharing), [router]);
  const openInvite = useCallback(
    (id: string) => router.push(socialRoutes.profile(id, true)),
    [router],
  );
  return useMemo(
    () => ({ me, openProfile, openWorkout, openSharing, openInvite }),
    [me, openProfile, openWorkout, openSharing, openInvite],
  );
}
