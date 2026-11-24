import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { useOptionalSession } from '../../session/SessionProvider';
import { useWorkout } from './WorkoutProvider';

// Tapping the rest timer's Live Activity (Lock Screen or Dynamic Island) opens
// `relay-mobile://workout`. While Relay is running, the router opens the logger itself. On a cold
// start the logger's route is still guarded while the session loads, so the router falls back to
// Sign in and then Home. This keeps that launch link until the session and the restored workout
// are ready for the account that signs in, then opens the logger.

/** How long a kept link waits for a restored workout, once signed in, before it's dropped. */
export const WORKOUT_LINK_WAIT_MS = 15_000;
/** The screens a visitor sees before the signed-in routes open. */
const SIGNED_OUT_PATHS = new Set(['/sign-in', '/password-required']);
const listeners = new Set<() => void>();
let pending = false;
let canOpenNow = false;

const current = () => pending;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function keep(value: boolean) {
  if (pending === value) return;
  pending = value;
  listeners.forEach((listener) => listener());
}

/** Relay's custom scheme, and the Expo Go transport used for the same route. */
export function isWorkoutLink(url: string): boolean {
  return /^(?:relay-mobile:\/\/\/?|exps?:\/\/[^/]+\/--\/|\/)workout\/?(?:[?#].*)?$/.test(url);
}

/** From `+native-intent`, which sees every system link: keeps a workout link the app can't open yet. */
export function captureWorkoutLink(url: string) {
  if (!canOpenNow && isWorkoutLink(url)) keep(true);
}

/**
 * Opens a kept workout link once `canOpen` (signed in, with the workout engine running) and the
 * route guard has left Sign in, if a workout is live. Without one it waits a while for a restored
 * workout, then drops the link. Signing out drops it too.
 */
export function useDeferredWorkoutLink({
  canOpen,
  live,
  signedOut,
}: {
  canOpen: boolean;
  live: boolean;
  signedOut: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ready = !!useRootNavigationState()?.key;
  const link = useSyncExternalStore(subscribe, current);

  useEffect(() => {
    canOpenNow = canOpen;
  }, [canOpen]);

  useEffect(() => {
    if (signedOut) keep(false);
  }, [signedOut]);

  useEffect(() => {
    if (!link || !canOpen || !ready || SIGNED_OUT_PATHS.has(pathname)) return;
    if (live) {
      keep(false);
      if (pathname !== '/workout') router.navigate('/workout');
      return;
    }
    const drop = setTimeout(() => keep(false), WORKOUT_LINK_WAIT_MS);
    return () => clearTimeout(drop);
  }, [link, canOpen, live, ready, pathname, router]);
}

/** Mounted inside the WorkoutProvider: opens a kept workout link for the signed-in account. */
export function WorkoutLinkOpener() {
  const status = useOptionalSession()?.status;
  const { live } = useWorkout();
  const signedIn = status?.kind === 'signed-in';
  useDeferredWorkoutLink({
    canOpen: signedIn && !status.user.must_change_password,
    live: !!live,
    signedOut: status?.kind === 'signed-out',
  });
  return null;
}

/** For tests: forget a kept link. */
export function resetWorkoutLinkForTests() {
  pending = false;
  canOpenNow = false;
}
