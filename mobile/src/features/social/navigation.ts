import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useUser } from '../../session/SessionProvider';

/** A shared workout to open: `comments` scrolls to them, at `commentId` when given. */
export interface WorkoutTarget {
  id: string;
  memberId: string;
  date: string;
  comments?: boolean;
  commentId?: string;
}

/** A workout a profile opens at: its history shows that day, with the workout open. */
export interface LinkedWorkout {
  id: string;
  workout_date: string;
}

/** Social's screens, pushed over the tabs so Home and Social open them the same way. */
export const socialRoutes = {
  profile: (id: string, invite = false) =>
    ({
      pathname: '/social/profile/[id]',
      params: invite ? { id, invite: '1' } : { id },
    }) as const,
  /** A member's profile scrolled to one of their workouts, as the web's session links open it. */
  profileAt: (id: string, workout: LinkedWorkout) =>
    ({
      pathname: '/social/profile/[id]',
      params: { id, workout: workout.id, date: workout.workout_date },
    }) as const,
  workout: (workout: WorkoutTarget) =>
    ({
      pathname: '/social/workout/[id]',
      params: {
        id: workout.id,
        member: workout.memberId,
        date: workout.date,
        ...(workout.comments ? { comments: '1' } : {}),
        ...(workout.commentId ? { comment: workout.commentId } : {}),
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
    (workout: WorkoutTarget) => router.push(socialRoutes.workout(workout)),
    [router],
  );
  const openProfileAt = useCallback(
    (person: { id: string }, workout: LinkedWorkout) =>
      router.push(socialRoutes.profileAt(person.id, workout)),
    [router],
  );
  const openSharing = useCallback(() => router.push(socialRoutes.sharing), [router]);
  const openInvite = useCallback(
    (id: string) => router.push(socialRoutes.profile(id, true)),
    [router],
  );
  return useMemo(
    () => ({ me, openProfile, openProfileAt, openWorkout, openSharing, openInvite }),
    [me, openProfile, openProfileAt, openWorkout, openSharing, openInvite],
  );
}
