import type { QueryClient } from '@tanstack/react-query';
import type { Routine } from '../../../../../frontend/src/types';
import { request, serverOrigin } from '../../../data/api';
import { sessionToken } from '../../../data/session';
import { queryKeys } from '../../../data/queries';
import { isToastAccountCurrent, toastAccount } from '../../../ui/Toast';
import { refreshSplits, settingsKeys } from '../settingsData';

/** Where Save split's copy opens: the split library at that split, or its editor. */
export const splitRoutes = {
  library: (openId?: string) =>
    openId ? ({ pathname: '/split', params: { open: openId } } as const) : ('/split' as const),
  edit: (id: string) => ({ pathname: '/split/edit', params: { id } }) as const,
};

/** The outcome of Save split: the private copy, or nothing when the account changed meanwhile. */
export type FriendSplitCopy = { kind: 'saved'; routine: Routine } | { kind: 'stale' };

/**
 * Saves a private copy of a friend's shared split into your own library, as the web's
 * `api.routines.copy`. The server maps its workout types and exercises onto yours, adding any you
 * lack, so the split library, the workout types and the exercise catalogue are all read again.
 *
 * The save is bound to the session that starts it: the account is captured at once and the request
 * carries that session's own token, read before anything else can change. If the session changed
 * while the token was read (or there is none), nothing is sent. A copy that answers after a switch
 * writes nothing into the new account's cache and reports `stale`.
 */
export async function copyFriendSplit(
  client: QueryClient,
  ownerId: string,
  routineId: string,
): Promise<FriendSplitCopy> {
  const account = toastAccount();
  const token = await sessionToken(serverOrigin());
  // A switch (or sign-out) while the token was read: never send with another session's token.
  if (!token || !isToastAccountCurrent(account)) return { kind: 'stale' };
  const routine = await request<Routine>(
    `/api/routines/profile/${encodeURIComponent(ownerId)}/${encodeURIComponent(routineId)}/copy`,
    { method: 'POST' },
    token,
  );
  if (!isToastAccountCurrent(account)) return { kind: 'stale' };
  // The library shows the copy at once, and its editor can open on it before the refresh lands.
  client.setQueryData<Routine[]>(settingsKeys.routines, (current) =>
    current ? [routine, ...current.filter((item) => item.id !== routine.id)] : current,
  );
  await Promise.all([
    refreshSplits(client),
    client.invalidateQueries({ queryKey: queryKeys.workoutTypes }),
    // A friend's custom exercise is added to your catalogue, so the pickers must offer it.
    client.invalidateQueries({ queryKey: queryKeys.exercises }),
  ]);
  return isToastAccountCurrent(account) ? { kind: 'saved', routine } : { kind: 'stale' };
}
