import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { friendInviteIdFromHash } from '../../../frontend/src/friendInviteLink';
import { readJson, writeJson } from '../data/deviceStorage';
import { socialRoutes } from '../features/social/navigation';

const KEY = 'relay.pendingFriendInvite';
/** The screens a visitor sees before the signed-in routes open. */
const SIGNED_OUT_PATHS = new Set(['/sign-in', '/password-required']);
const listeners = new Set<() => void>();
let pending: string | null | undefined;
let canOpenNow = false;

const currentInvite = () => {
  if (pending === undefined) pending = readJson<string>(KEY);
  return pending;
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function saveInvite(id: string | null) {
  pending = id;
  writeJson(KEY, id);
  listeners.forEach((listener) => listener());
}

/** Accept Relay's custom scheme and the Expo Go transport used for the same route. */
export function friendInviteFromUrl(url: string): string | null {
  const route =
    /^(?:relay-mobile:\/\/\/?|exps?:\/\/[^/]+\/--\/|\/)social\/profile\/([^/?#]+)\?([^#]+)/.exec(
      url,
    );
  if (!route || new URLSearchParams(route[2]).get('invite') !== '1') return null;
  return friendInviteIdFromHash(`#friend=${route[1]}`);
}

/**
 * Keeps an invite link that arrives before its route can open (from `+native-intent`, which sees
 * every system link, the launch link included). A signed-in app opens the link itself.
 */
export function captureFriendInvite(url: string) {
  if (canOpenNow) return;
  const id = friendInviteFromUrl(url);
  if (id && currentInvite() !== id) saveInvite(id);
}

/** Opens a kept invite once the visitor has signed in or created an account. */
export function useDeferredFriendInvite(canOpen: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const ready = !!useRootNavigationState()?.key;
  const invite = useSyncExternalStore(subscribe, currentInvite);

  useEffect(() => {
    canOpenNow = canOpen;
  }, [canOpen]);

  useEffect(() => {
    // Wait until the route guard has left Sign in: its reset to Home would undo an earlier jump.
    if (!canOpen || !ready || !invite || SIGNED_OUT_PATHS.has(pathname)) return;
    const id = friendInviteIdFromHash(`#friend=${invite}`);
    saveInvite(null);
    if (id && pathname !== `/social/profile/${id}`) router.navigate(socialRoutes.profile(id, true));
  }, [canOpen, pathname, invite, ready, router]);
}
