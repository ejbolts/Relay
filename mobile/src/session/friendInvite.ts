import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { friendInviteIdFromHash } from '../../../frontend/src/friendInviteLink';
import { readJson, writeJson } from '../data/deviceStorage';
import { socialRoutes } from '../features/social/navigation';

const KEY = 'relay.pendingFriendInvite';
/** A friend link's registration code for a closed server, which pre-fills Create account. */
const CODE_KEY = 'relay.pendingRegistrationInvite';
/** The screens a visitor sees before the signed-in routes open. */
const SIGNED_OUT_PATHS = new Set(['/sign-in', '/password-required']);
const listeners = new Set<() => void>();
let pending: string | null | undefined;
let canOpenNow = false;
/** The latest link's registration code; `version` moves on each new invite link. */
export interface RegistrationInvite {
  code: string | null;
  version: number;
}
const codeListeners = new Set<() => void>();
let registration: RegistrationInvite | undefined;

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

function storedCode(): string | null {
  const code = readJson<string>(CODE_KEY);
  return typeof code === 'string' && code.length <= 200 ? code : null;
}
const currentRegistration = () => (registration ??= { code: storedCode(), version: 0 });
const subscribeCode = (listener: () => void) => {
  codeListeners.add(listener);
  return () => {
    codeListeners.delete(listener);
  };
};
function saveCode(code: string | null) {
  writeJson(CODE_KEY, code);
  registration = { code, version: currentRegistration().version + 1 };
  codeListeners.forEach((listener) => listener());
}

/**
 * Keeps an invite link that arrives before its route can open (from `+native-intent`, which sees
 * every system link, the launch link included). A signed-in app opens the link itself.
 * `registrationCode` is the link's code for a closed server: as on the web, a link without one
 * replaces an earlier friend's code.
 */
export function captureFriendInvite(url: string, registrationCode: string | null = null) {
  if (canOpenNow) return;
  const id = friendInviteFromUrl(url);
  if (!id) return;
  saveCode(registrationCode || null);
  if (currentInvite() !== id) saveInvite(id);
}

/** The registration code from the friend link that opened the app, for Create account. */
export function pendingRegistrationInvite(): string | null {
  return currentRegistration().code;
}

/** The latest invite link's code, so an open Create account form follows a new link. */
export function useRegistrationInvite(): RegistrationInvite {
  return useSyncExternalStore(subscribeCode, currentRegistration);
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
    // Signed in now: the code has done its job, as the web clears it with the invite.
    saveCode(null);
    if (id && pathname !== `/social/profile/${id}`) router.navigate(socialRoutes.profile(id, true));
  }, [canOpen, pathname, invite, ready, router]);
}
