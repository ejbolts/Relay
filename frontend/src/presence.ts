import { useEffect, useState } from 'react';
import { inactiveWorkoutFinishAt } from './activeWorkoutTimeout';
import type { FriendPresence, LiveWorkout } from './types';
import { workoutNameForCategory } from './workoutCategory';
import {
  ACTIVE_WORKOUT_CHANGE_EVENT,
  ACTIVE_WORKOUT_DRAFT_KEY,
  readActiveWorkoutDraft,
} from './workoutDraft';

const DEVICE_KEY = 'relay.presence-device';
const HEARTBEAT_MS = 25_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** The server closes with this code when the window is no longer signed in. */
const SIGNED_OUT = 4401;
// Routine set logging moves the auto-finish time; rounding keeps that from resending state.
const EXPIRY_STEP_MS = 5 * 60_000;

type PresenceListener = (friendId: string, presence: FriendPresence | null) => void;
const listeners = new Set<PresenceListener>();

/** Live presence changes for friends, pushed while the presence connection is open. */
export function onFriendPresence(listener: PresenceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishFriendPresence(friendId: string, presence: FriendPresence | null): void {
  for (const listener of listeners) listener(friendId, presence);
}

let fallbackDevice: string | null = null;

/** A stable id for this browser, so another device cannot end the workout logged here. */
function deviceId(): string {
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    fallbackDevice ??= `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return fallbackDevice;
  }
}

/** This device's workout in progress, as reported to friends, or null when there is none. */
export function liveWorkoutReport(now = Date.now()): (LiveWorkout & { expires_at: string }) | null {
  const draft = readActiveWorkoutDraft();
  if (!draft) return null;
  const finishAt =
    draft.inactiveFinishAt ??
    inactiveWorkoutFinishAt(draft.startedAt, draft.lastActiveAt ?? draft.updatedAt);
  if (finishAt <= now) return null;
  return {
    name: draft.name.trim() || workoutNameForCategory(draft.category),
    kind: draft.category === 'cardio' ? 'cardio' : 'strength',
    started_at: new Date(draft.startedAt).toISOString(),
    expires_at: new Date(Math.ceil(finishAt / EXPIRY_STEP_MS) * EXPIRY_STEP_MS).toISOString(),
  };
}

/**
 * Keep a presence WebSocket open while signed in. It tells the server when this window is
 * visible and which workout this device is doing, and passes friends' changes to
 * `onFriendPresence` listeners. A dropped connection retries with backoff; a hidden window
 * reconnects when it is shown again.
 */
export function usePresenceConnection(userId: string | null): void {
  useEffect(() => {
    if (!userId || typeof WebSocket === 'undefined') return;
    const device = deviceId();
    let socket: WebSocket | null = null;
    let lastSent = '';
    let attempts = 0;
    let retryTimer: number | undefined;
    let stopped = false;

    function send(force = false) {
      if (socket?.readyState !== WebSocket.OPEN) return;
      const state = JSON.stringify({
        type: 'state',
        device,
        visible: document.visibilityState === 'visible',
        workout: liveWorkoutReport(),
      });
      if (!force && state === lastSent) return;
      socket.send(state);
      lastSent = state;
    }

    function connect() {
      window.clearTimeout(retryTimer);
      if (stopped || socket) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const current = new WebSocket(`${protocol}//${window.location.host}/api/presence/ws`);
      socket = current;
      current.onopen = () => {
        attempts = 0;
        send(true);
      };
      current.onmessage = (event: MessageEvent) => {
        try {
          const message: unknown = JSON.parse(String(event.data));
          if (
            message &&
            typeof message === 'object' &&
            'type' in message &&
            message.type === 'presence' &&
            'user_id' in message &&
            typeof message.user_id === 'string' &&
            'presence' in message
          ) {
            publishFriendPresence(message.user_id, message.presence as FriendPresence | null);
          }
        } catch {
          // Ignore anything that is not a presence update.
        }
      };
      current.onclose = (event: CloseEvent) => {
        if (socket === current) socket = null;
        if (stopped || event.code === SIGNED_OUT || document.visibilityState === 'hidden') return;
        const delay = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)];
        attempts += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') connect();
      send();
    }
    const onWorkoutChange = () => send();
    function onStorage(event: StorageEvent) {
      if (event.key === ACTIVE_WORKOUT_DRAFT_KEY) send();
    }
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') send(true);
    }, HEARTBEAT_MS);

    connect();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', connect);
    window.addEventListener(ACTIVE_WORKOUT_CHANGE_EVENT, onWorkoutChange);
    window.addEventListener('storage', onStorage);
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', connect);
      window.removeEventListener(ACTIVE_WORKOUT_CHANGE_EVENT, onWorkoutChange);
      window.removeEventListener('storage', onStorage);
      socket?.close(1000);
      socket = null;
    };
  }, [userId]);
}

/** The current time, refreshed every `intervalMs` while `enabled`, for elapsed labels. */
export function useNow(enabled: boolean, intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}

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
