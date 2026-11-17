import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { AdminUser, FriendPresence } from './types';

export const ADMIN_ACTIVITY_SUBSCRIPTION_EVENT = 'relay:admin-activity-subscription';
export interface AdminActivity {
  userId: string;
  presence: FriendPresence;
}
type Listener = (activity: AdminActivity | null) => void;
const listeners = new Set<Listener>();

/** Null asks the screen to reconcile its snapshot after the socket subscribes again. */
export function publishAdminActivity(activity: AdminActivity | null): void {
  for (const listener of listeners) listener(activity);
}

export function hasAdminActivitySubscribers(): boolean {
  return listeners.size > 0;
}

export function onAdminActivity(listener: Listener): () => void {
  listeners.add(listener);
  window.dispatchEvent(new Event(ADMIN_ACTIVITY_SUBSCRIPTION_EVENT));
  return () => {
    listeners.delete(listener);
    window.dispatchEvent(new Event(ADMIN_ACTIVITY_SUBSCRIPTION_EVENT));
  };
}

/** Update only user cards; incoming activity never reloads editable server settings. */
export function useAdminUsers(active: boolean) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const generation = useRef(0);
  const revision = useRef(0);
  const updates = useRef(new Map<string, { revision: number; presence: FriendPresence }>());
  const loadUsers = useCallback(async () => {
    const request = ++generation.current;
    const before = revision.current;
    const snapshot = await api.admin.users();
    if (request !== generation.current) return;
    setUsers(
      snapshot.map((user) => {
        const update = updates.current.get(user.id);
        return update && update.revision > before
          ? { ...user, presence: update.presence, last_active_at: update.presence.last_active_at }
          : user;
      }),
    );
  }, []);

  const invalidate = useCallback(() => {
    ++generation.current;
    updates.current.clear();
  }, []);

  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (document.visibilityState !== 'hidden') void loadUsers().catch(() => undefined);
    };
    const stop = onAdminActivity((activity) => {
      if (!activity) {
        refresh();
        return;
      }
      updates.current.set(activity.userId, {
        revision: ++revision.current,
        presence: activity.presence,
      });
      setUsers(
        (current) =>
          current?.map((user) =>
            user.id === activity.userId
              ? {
                  ...user,
                  presence: activity.presence,
                  last_active_at: activity.presence.last_active_at,
                }
              : user,
          ) ?? null,
      );
    });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stop();
      invalidate();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [active, loadUsers, invalidate]);

  return { users, setUsers, loadUsers };
}
