import { onlineManager, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  APP_NOTICES_WAIT_MS,
  newerAppNotices,
  type AppNotices,
} from '../../../../frontend/src/appNoticeRules';
import { ApiError, apiGet, request, serverOrigin } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { sessionToken } from '../../data/session';

/** Each account's notices under its own key, so one account's answer never reaches another's. */
export const appNoticeKeys = { account: (userId: string) => ['app-notices', userId] as const };

const pendingKey = (userId: string) => `relay.app-notices.pending:${encodeURIComponent(userId)}`;

/** Mounted screens per signed-in account: only an account with one on screen sends. */
const mounted = new Map<string, number>();
const isActive = (userId: string) => (mounted.get(userId) ?? 0) > 0;
const sending = new Set<string>();
const sendAgain = new Set<string>();

function pendingFor(userId: string): Partial<AppNotices> | null {
  try {
    const value = deviceStorage.getItem(pendingKey(userId));
    return value ? (JSON.parse(value) as Partial<AppNotices>) : null;
  } catch {
    return null;
  }
}

/** Saves the account's unsent markers, or forgets them once none are left. */
function setPending(userId: string, notices: Partial<AppNotices>) {
  const left = Object.fromEntries(Object.entries(notices).filter(([, value]) => !!value));
  try {
    if (Object.keys(left).length) deviceStorage.setItem(pendingKey(userId), JSON.stringify(left));
    else deviceStorage.removeItem(pendingKey(userId));
  } catch {
    // The marker still reaches the cache; it just isn't kept for a later visit.
  }
}

/**
 * What the account has already seen on any device, so this phone doesn't repeat What's new or
 * the weekly review. Offline, or if the server is slow, the app goes by what the phone knows,
 * including markers it hasn't been able to send yet, which it sends again when it reconnects.
 */
export function useAppNotices(userId: string): { ready: boolean; notices: AppNotices | null } {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: appNoticeKeys.account(userId),
    queryFn: async ({ signal }) =>
      newerAppNotices(await apiGet<AppNotices>('/api/app-notices', signal), pendingFor(userId)),
    staleTime: 5 * 60_000,
  });
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), APP_NOTICES_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    mounted.set(userId, (mounted.get(userId) ?? 0) + 1);
    void sendPending(client, userId);
    const stop = onlineManager.subscribe((online) => {
      if (online) void sendPending(client, userId);
    });
    return () => {
      stop();
      const left = (mounted.get(userId) ?? 1) - 1;
      if (left > 0) mounted.set(userId, left);
      else mounted.delete(userId);
    };
  }, [client, userId]);
  const pending = pendingFor(userId);
  return {
    ready: query.isFetched || waited,
    notices: query.data ?? (pending ? newerAppNotices(null, pending) : null),
  };
}

/**
 * Records a notice as seen for the whole account. The phone keeps it until the server has it, so
 * a failed or interrupted save is sent again later for the same account, never another one.
 */
export function recordAppNotices(client: QueryClient, userId: string, change: Partial<AppNotices>) {
  const pending = newerAppNotices(pendingFor(userId), change);
  setPending(userId, pending);
  client.setQueryData<AppNotices>(appNoticeKeys.account(userId), (current) =>
    newerAppNotices(current, change),
  );
  void sendPending(client, userId);
}

/** Sends the account's unsent markers with its own session, one save at a time. */
export async function sendPending(client: QueryClient, userId: string): Promise<void> {
  if (sending.has(userId)) {
    sendAgain.add(userId);
    return;
  }
  sending.add(userId);
  try {
    do {
      sendAgain.delete(userId);
      const pending = pendingFor(userId);
      if (!pending || !isActive(userId) || !onlineManager.isOnline()) return;
      const token = await sessionToken(serverOrigin());
      // Signed out (or into another account) meanwhile: keep it for this account's next visit.
      if (!token || !isActive(userId)) return;
      let saved: AppNotices;
      try {
        saved = await request<AppNotices>(
          '/api/app-notices',
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pending),
          },
          token,
        );
      } catch (error) {
        // The server refuses the marker outright (422): sending it again can't help.
        if (error instanceof ApiError && error.status === 422) forget(userId, pending);
        return;
      }
      forget(userId, pending);
      if (isActive(userId))
        client.setQueryData<AppNotices>(appNoticeKeys.account(userId), (current) =>
          newerAppNotices(current, saved),
        );
    } while (sendAgain.has(userId));
  } finally {
    sending.delete(userId);
  }
}

/** Drops the markers just sent, keeping any newer one recorded while they were on the way. */
function forget(userId: string, sent: Partial<AppNotices>) {
  const now = pendingFor(userId);
  if (!now) return;
  const left: Partial<AppNotices> = {};
  if (now.release_seen && now.release_seen !== sent.release_seen)
    left.release_seen = now.release_seen;
  if (now.weekly_review_seen && now.weekly_review_seen !== sent.weekly_review_seen)
    left.weekly_review_seen = now.weekly_review_seen;
  setPending(userId, left);
}

/** Forgets the signed-in accounts, for tests. */
export function resetAppNoticeSending() {
  mounted.clear();
  sending.clear();
  sendAgain.clear();
}
