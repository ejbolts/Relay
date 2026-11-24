import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { useOptionalSession } from '../../session/SessionProvider';
import { useWorkout } from './WorkoutProvider';

// Tapping the rest timer's Live Activity (Lock Screen or Dynamic Island) opens
// `relay-mobile://workout`. While Relay is running, the router opens the logger itself. On a cold
// start the logger's route is still guarded while the session loads, so the router falls back to
// Sign in and then Home. This keeps that launch link, for the account the session then opens, and
// opens the logger once that account's restored workout is live.
//
// Only a link that arrives before the first session check finishes is kept: it belongs to whoever
// was signed in when the activity was tapped. Once the session is known, the router handles links
// (signed in), or there's no workout to open (signed out). A kept link is dropped when the session
// signs out or changes account, and when no workout is live within WORKOUT_LINK_WAIT_MS of its
// arrival.

/** How long after it arrives a kept link may wait for the restored workout. */
export const WORKOUT_LINK_WAIT_MS = 15_000;
/** The screens a visitor sees before the signed-in routes open. */
const SIGNED_OUT_PATHS = new Set(['/sign-in', '/password-required']);

interface KeptLink {
  arrivedAt: number;
  /** The account the session opened after the link arrived; null until then. */
  userId: string | null;
}

const listeners = new Set<() => void>();
let kept: KeptLink | null = null;
/** Whether the first session check has finished since the app launched. */
let sessionKnown = false;

const current = () => kept;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function keep(link: KeptLink | null) {
  if (kept === link) return;
  kept = link;
  listeners.forEach((listener) => listener());
}

/** Relay's custom scheme, and the Expo Go transport used for the same route. */
export function isWorkoutLink(url: string): boolean {
  return /^(?:relay-mobile:\/\/\/?|exps?:\/\/[^/]+\/--\/|\/)workout\/?(?:[?#].*)?$/.test(url);
}

/** From `+native-intent`, which sees every system link: keeps a launch link to the workout. */
export function captureWorkoutLink(url: string) {
  if (!sessionKnown && isWorkoutLink(url)) keep({ arrivedAt: Date.now(), userId: null });
}

/**
 * Opens a kept workout link once `canOpen` (signed in, past any required password change) and the
 * route guard has left Sign in, if a workout is live and the link is still in time.
 */
export function useDeferredWorkoutLink({
  loading,
  userId,
  canOpen,
  live,
}: {
  /** The session is still being checked. */
  loading: boolean;
  /** The signed-in account, or null. */
  userId: string | null;
  canOpen: boolean;
  live: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ready = !!useRootNavigationState()?.key;
  const link = useSyncExternalStore(subscribe, current);

  useEffect(() => {
    if (!loading) sessionKnown = true;
  }, [loading]);

  // The link belongs to the first account the session opens; any other sign-in state drops it.
  useEffect(() => {
    if (!link || loading) return;
    if (!userId) keep(null);
    else if (link.userId === null) keep({ ...link, userId });
    else if (link.userId !== userId) keep(null);
  }, [link, loading, userId]);

  useEffect(() => {
    if (!link || link.userId === null || link.userId !== userId) return;
    const left = link.arrivedAt + WORKOUT_LINK_WAIT_MS - Date.now();
    if (left <= 0) {
      keep(null);
      return;
    }
    if (!canOpen || !ready || SIGNED_OUT_PATHS.has(pathname)) return;
    if (live) {
      keep(null);
      if (pathname !== '/workout') router.navigate('/workout');
      return;
    }
    // Measured from the link's arrival, so moving between screens doesn't extend it.
    const drop = setTimeout(() => keep(null), left);
    return () => clearTimeout(drop);
  }, [link, userId, canOpen, live, ready, pathname, router]);
}

/** Mounted inside the WorkoutProvider: opens a kept workout link for the signed-in account. */
export function WorkoutLinkOpener() {
  const status = useOptionalSession()?.status;
  const { live } = useWorkout();
  const signedIn = status?.kind === 'signed-in';
  useDeferredWorkoutLink({
    loading: status?.kind === 'loading',
    userId: signedIn ? status.user.id : null,
    canOpen: signedIn && !status.user.must_change_password,
    live: !!live,
  });
  return null;
}

/** For tests: forget a kept link. */
export function resetWorkoutLinkForTests() {
  kept = null;
  sessionKnown = false;
}
