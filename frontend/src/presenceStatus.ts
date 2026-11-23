import type { FriendPresence, LiveWorkout } from './types';

// What a friend's live activity says, shared by the web and the app. The web's presence
// connection (presence.ts) re-exports these.

/** "38 min" or "1 h 05" since a workout started. */
export function workoutElapsed(startedAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60_000));
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** "Active 5m ago", "Active yesterday" or "Active 3d ago". */
export function activeAgo(lastActiveAt: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(lastActiveAt)) / 60_000);
  if (minutes < 1) return 'Active just now';
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  if (hours < 48) return 'Active yesterday';
  return `Active ${Math.floor(hours / 24)}d ago`;
}

export type PresenceStatus =
  | { kind: 'workout'; workout: LiveWorkout }
  | { kind: 'online' }
  | { kind: 'away'; lastActiveAt: string }
  | null;

export function presenceStatus(presence: FriendPresence | null | undefined): PresenceStatus {
  if (!presence) return null;
  if (presence.workout) return { kind: 'workout', workout: presence.workout };
  if (presence.online) return { kind: 'online' };
  if (presence.last_active_at) return { kind: 'away', lastActiveAt: presence.last_active_at };
  return null;
}

/** "Working out", "Active now" or "Active 2h ago", or null when nothing is shared. */
export function presenceText(status: PresenceStatus, now = Date.now()): string | null {
  if (!status) return null;
  if (status.kind === 'workout') return 'Working out';
  if (status.kind === 'online') return 'Active now';
  return activeAgo(status.lastActiveAt, now);
}

/** Working out first (latest start first), then online, keeping the given order otherwise. */
export function byLiveActivity<T>(
  items: T[],
  presenceOf: (item: T) => FriendPresence | null | undefined,
): T[] {
  const rank = (item: T) => {
    const status = presenceStatus(presenceOf(item));
    return status?.kind === 'workout' ? 0 : status?.kind === 'online' ? 1 : 2;
  };
  const started = (item: T) => Date.parse(presenceOf(item)?.workout?.started_at ?? '') || 0;
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        rank(a.item) - rank(b.item) ||
        (rank(a.item) === 0 ? started(b.item) - started(a.item) : 0) ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

/** The dot an avatar shows: working out or online, or none. */
export function presenceDot(status: PresenceStatus): 'workout' | 'online' | null {
  return status?.kind === 'workout' || status?.kind === 'online' ? status.kind : null;
}
