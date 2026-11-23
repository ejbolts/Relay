import type { QueryClient } from '@tanstack/react-query';
import type { Routine } from '../../../../../frontend/src/types';
import { apiSend } from '../../../data/api';
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
 * `api.routines.copy`. The server maps its workout types onto yours, adding any you lack, so the
 * split library and the workout types are both read again.
 *
 * The account is captured when the save starts: a copy that answers after a switch to another
 * account writes nothing into that account's cache and reports `stale`. (The request itself was
 * sent with the starting account's session, so it can only land in that account's library.)
 */
export async function copyFriendSplit(
  client: QueryClient,
  ownerId: string,
  routineId: string,
): Promise<FriendSplitCopy> {
  const account = toastAccount();
  const routine = await apiSend<Routine>(
    `/api/routines/profile/${encodeURIComponent(ownerId)}/${encodeURIComponent(routineId)}/copy`,
    'POST',
  );
  if (!isToastAccountCurrent(account)) return { kind: 'stale' };
  // The library shows the copy at once, and its editor can open on it before the refresh lands.
  client.setQueryData<Routine[]>(settingsKeys.routines, (current) =>
    current ? [routine, ...current.filter((item) => item.id !== routine.id)] : current,
  );
  await Promise.all([
    refreshSplits(client),
    client.invalidateQueries({ queryKey: queryKeys.workoutTypes }),
  ]);
  return isToastAccountCurrent(account) ? { kind: 'saved', routine } : { kind: 'stale' };
}
