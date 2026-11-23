import { inactiveWorkoutFinishAt } from './activeWorkoutTimeout';
import type { FriendPresence, LiveWorkout } from './types';
import { workoutNameForCategory } from './workoutCategory';
import type { ActiveWorkoutDraft } from './workoutDraft';
import { clockOffsetMsAt, draftPause } from './workoutPause';

export const PRESENCE_SOCKET_PATH = '/api/presence/ws';
export const PRESENCE_HEARTBEAT_MS = 25_000;
export const PRESENCE_SIGNED_OUT = 4401;
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
// Rounding expiry keeps routine set logging from resending otherwise unchanged state.
const EXPIRY_STEP_MS = 5 * 60_000;

export function presenceRetryDelay(attempt: number) {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

export function workoutPresence(draft: ActiveWorkoutDraft | null, now: number) {
  if (!draft) return null;
  const finishAt =
    draft.inactiveFinishAt ??
    inactiveWorkoutFinishAt(draft.startedAt, draft.lastActiveAt ?? draft.updatedAt);
  if (finishAt <= now) return null;
  return {
    name: draft.name.trim() || workoutNameForCategory(draft.category),
    kind: draft.category === 'cardio' ? 'cardio' : 'strength',
    started_at: new Date(draft.startedAt + clockOffsetMsAt(draftPause(draft), now)).toISOString(),
    expires_at: new Date(Math.ceil(finishAt / EXPIRY_STEP_MS) * EXPIRY_STEP_MS).toISOString(),
  } satisfies LiveWorkout & { expires_at: string };
}

export type FriendPresenceEvent = {
  type: 'presence';
  user_id: string;
  presence: FriendPresence | null;
};

type PresenceEvent =
  | FriendPresenceEvent
  | { type: 'active_workout' | 'notifications' | 'admin_activity_sync' }
  | { type: 'admin_activity'; user_id: string; presence: FriendPresence };

export function decodePresenceEvent(data: unknown): PresenceEvent | null {
  if (typeof data !== 'string') return null;
  try {
    const message: unknown = JSON.parse(data);
    if (!message || typeof message !== 'object' || !('type' in message)) return null;
    const { type } = message;
    if (type === 'active_workout' || type === 'notifications' || type === 'admin_activity_sync')
      return { type };
    if (!('user_id' in message) || typeof message.user_id !== 'string' || !('presence' in message))
      return null;
    const { user_id, presence } = message;
    if (presence && typeof presence === 'object') {
      if (type === 'admin_activity' || type === 'presence')
        return { type, user_id, presence: presence as FriendPresence };
    }
    return type === 'presence' && presence === null ? { type, user_id, presence } : null;
  } catch {
    return null;
  }
}
