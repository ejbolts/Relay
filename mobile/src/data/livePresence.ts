import { onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import {
  decodePresenceEvent,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_SIGNED_OUT,
  PRESENCE_SOCKET_PATH,
  presenceRetryDelay,
  workoutPresence,
  type FriendPresenceEvent,
} from '../../../frontend/src/presenceProtocol';
import type { ActiveWorkoutDraft } from '../../../frontend/src/workoutDraft';
import { apiOrigin, clientVersionHeaders, serverOrigin } from './api';
import { newId, readJson, writeJson } from './deviceStorage';
import { sessionToken } from './session';

const DEVICE_KEY = 'relay.presence-device';
let device: string | undefined;

function deviceId() {
  if (device) return device;
  device = readJson<string>(DEVICE_KEY) || newId();
  writeJson(DEVICE_KEY, device);
  return device;
}

interface Listeners {
  readWorkout: () => ActiveWorkoutDraft | null;
  onOpen: () => void;
  onActiveWorkout: () => void;
  onFriendPresence: (event: FriendPresenceEvent) => void;
  /** The inbox changed (a request, reaction or comment), as the web's bell hears it. */
  onNotifications?: () => void;
  onSignedOut: () => void;
}

/** One socket for the signed-in engine, while the app is visible and the network is available. */
export function connectLivePresence(listeners: Listeners) {
  let socket: WebSocket | null = null;
  let generation = 0;
  let connecting = false;
  let stopped = false;
  let signedOut = false;
  let active = AppState.currentState == null || AppState.currentState === 'active';
  let lastSent = '';
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const eligible = () => !stopped && !signedOut && active && onlineManager.isOnline();

  function report(force = false) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const state = JSON.stringify({
      type: 'state',
      device: deviceId(),
      visible: true,
      workout: workoutPresence(listeners.readWorkout(), Date.now()),
    });
    if (force || state !== lastSent) {
      socket.send(state);
      lastSent = state;
    }
  }

  function retry() {
    if (eligible()) retryTimer = setTimeout(() => void connect(), presenceRetryDelay(attempts++));
  }

  async function connect() {
    clearTimeout(retryTimer);
    if (!eligible() || socket || connecting) return;
    connecting = true;
    const attempt = generation;
    try {
      const origin = serverOrigin();
      const token = await sessionToken(origin);
      if (!eligible() || attempt !== generation || !token) return;
      const url = origin.replace(/^http/, 'ws') + PRESENCE_SOCKET_PATH;
      // Expo includes browser types, whose constructor omits React Native's header option.
      const NativeWebSocket = WebSocket as new (
        url: string,
        protocols: string[],
        options: { headers: Record<string, string> },
      ) => WebSocket;
      const current = new NativeWebSocket(url, [], {
        headers: {
          ...clientVersionHeaders(),
          Authorization: `Bearer ${token}`,
        },
      });
      socket = current;
      current.onopen = () => {
        if (socket !== current) return;
        attempts = 0;
        report(true);
        listeners.onOpen();
      };
      current.onmessage = (event) => {
        if (socket !== current) return;
        const message = decodePresenceEvent(event.data);
        if (message?.type === 'active_workout') listeners.onActiveWorkout();
        if (message?.type === 'presence') listeners.onFriendPresence(message);
        if (message?.type === 'notifications') listeners.onNotifications?.();
      };
      current.onclose = (event) => {
        if (socket !== current) return;
        socket = null;
        if (event.code === PRESENCE_SIGNED_OUT) {
          signedOut = true;
          listeners.onSignedOut();
          return;
        }
        retry();
      };
    } catch {
      if (attempt === generation) retry();
    } finally {
      if (attempt === generation) connecting = false;
    }
  }

  function disconnect() {
    generation++;
    connecting = false;
    clearTimeout(retryTimer);
    const current = socket;
    socket = null;
    current?.close(1000);
  }

  function updateConnection() {
    if (eligible()) void connect();
    else disconnect();
  }

  if (!apiOrigin) return { report, stop: disconnect };
  const app = AppState.addEventListener('change', (state) => {
    active = state === 'active';
    updateConnection();
  });
  const net = onlineManager.subscribe(updateConnection);
  const heartbeat = setInterval(() => report(true), PRESENCE_HEARTBEAT_MS);
  updateConnection();
  return {
    report,
    stop() {
      stopped = true;
      disconnect();
      app?.remove();
      net();
      clearInterval(heartbeat);
    },
  };
}
