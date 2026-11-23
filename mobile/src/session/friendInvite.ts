import { getLinkingURL } from 'expo-linking';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { friendInviteIdFromHash } from '../../../frontend/src/friendInviteLink';
import { readJson, writeJson } from '../data/deviceStorage';
import { socialRoutes } from '../features/social/navigation';

const KEY = 'relay.pendingFriendInvite';
const listeners = new Set<() => void>();
let pending: string | null | undefined;

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

export function captureFriendInvite(url: string) {
  const id = friendInviteFromUrl(url);
  console.info('invite probe', url.includes('social/profile/'), url.includes('/--/'), !!id);
  if (id && currentInvite() !== id) saveInvite(id);
}

/** Keep an invite while Expo's protected routes send the visitor through authentication. */
export function useDeferredFriendInvite(canOpen: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const ready = !!useRootNavigationState()?.key;
  const invite = useSyncExternalStore(subscribe, currentInvite);

  useEffect(() => {
    // Expo can hold the launch URL in its native module before the React Native listener mounts.
    const initial = getLinkingURL();
    if (initial) captureFriendInvite(initial);
  }, []);

  useEffect(() => {
    console.info(
      'invite route probe',
      canOpen,
      ready,
      !!invite,
      pathname.startsWith('/social/profile/'),
    );
    if (!canOpen || !ready || !invite || currentInvite() !== invite) return;
    const id = friendInviteIdFromHash(`#friend=${invite}`);
    saveInvite(null);
    // Expo may already have opened the initial URL in a restored session.
    if (id && pathname !== `/social/profile/${id}`) router.navigate(socialRoutes.profile(id, true));
  }, [canOpen, pathname, invite, ready, router]);
}
