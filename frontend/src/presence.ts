import { useEffect, useState } from 'react';
import { SHARED_WORKOUT_CHANGED } from './activeWorkoutEvents';
import { TRAIN_TOGETHER_CHANGED } from './trainTogetherInvite';
import {
  ADMIN_ACTIVITY_SUBSCRIPTION_EVENT,
  hasAdminActivitySubscribers,
  publishAdminActivity,
} from './adminActivity';
import { notifyNotificationsChanged } from './notificationEvents';
import {
  decodePresenceEvent,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_SIGNED_OUT,
  PRESENCE_SOCKET_PATH,
  presenceRetryDelay,
  workoutPresence,
} from './presenceProtocol';
import type { FriendPresence } from './types';
import {
  ACTIVE_WORKOUT_CHANGE_EVENT,
  ACTIVE_WORKOUT_DRAFT_KEY,
  readActiveWorkoutDraft,
} from './workoutDraft';

export {
  activeAgo,
  byLiveActivity,
  presenceStatus,
  presenceText,
  workoutElapsed,
  type PresenceStatus,
} from './presenceStatus';

const DEVICE_KEY = 'relay.presence-device';

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
export function liveWorkoutReport(now = Date.now()) {
  return workoutPresence(readActiveWorkoutDraft(), now);
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
    let adminSubscribed = false;

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

    function sendAdminSubscription() {
      const enabled = hasAdminActivitySubscribers();
      if (socket?.readyState !== WebSocket.OPEN || enabled === adminSubscribed) return;
      socket.send(JSON.stringify({ type: 'admin_activity', enabled }));
      adminSubscribed = enabled;
    }

    function connect() {
      window.clearTimeout(retryTimer);
      if (stopped || socket) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const current = new WebSocket(`${protocol}//${window.location.host}${PRESENCE_SOCKET_PATH}`);
      socket = current;
      current.onopen = () => {
        if (stopped || socket !== current) return;
        attempts = 0;
        send(true);
        adminSubscribed = false;
        sendAdminSubscription();
        notifyNotificationsChanged();
        window.dispatchEvent(new Event(SHARED_WORKOUT_CHANGED));
        window.dispatchEvent(new Event(TRAIN_TOGETHER_CHANGED));
      };
      current.onmessage = (event: MessageEvent) => {
        if (stopped || socket !== current) return;
        const message = decodePresenceEvent(event.data);
        switch (message?.type) {
          case 'active_workout':
            window.dispatchEvent(new Event(SHARED_WORKOUT_CHANGED));
            break;
          case 'train_together':
            window.dispatchEvent(new Event(TRAIN_TOGETHER_CHANGED));
            break;
          case 'admin_activity_sync':
            publishAdminActivity(null);
            break;
          case 'admin_activity':
            publishAdminActivity({ userId: message.user_id, presence: message.presence });
            break;
          case 'notifications':
            notifyNotificationsChanged();
            break;
          case 'presence':
            publishFriendPresence(message.user_id, message.presence);
            break;
        }
      };
      current.onclose = (event: CloseEvent) => {
        if (socket === current) socket = null;
        if (stopped || event.code === PRESENCE_SIGNED_OUT || document.visibilityState === 'hidden')
          return;
        retryTimer = window.setTimeout(connect, presenceRetryDelay(attempts++));
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
    }, PRESENCE_HEARTBEAT_MS);

    connect();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', connect);
    window.addEventListener(ACTIVE_WORKOUT_CHANGE_EVENT, onWorkoutChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener(ADMIN_ACTIVITY_SUBSCRIPTION_EVENT, sendAdminSubscription);
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', connect);
      window.removeEventListener(ACTIVE_WORKOUT_CHANGE_EVENT, onWorkoutChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(ADMIN_ACTIVITY_SUBSCRIPTION_EVENT, sendAdminSubscription);
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
