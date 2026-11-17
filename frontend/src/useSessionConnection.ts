import { useEffect } from 'react';
import { api, ApiError } from './api';
import { emitAuthExpired } from './authEvents';

const CHECK_MS = 30_000;
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/** Session security is always enabled, independently of social sharing preferences. */
export function useSessionConnection(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let attempts = 0;
    let checking = false;

    function expired() {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(retry);
      socket?.close();
      emitAuthExpired();
    }

    async function check() {
      if (stopped || checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const user = await api.auth.me();
        if (user.id !== userId) expired();
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) expired();
        // Offline and server failures must not discard an unfinished workout.
      } finally {
        checking = false;
      }
    }

    function connect() {
      window.clearTimeout(retry);
      if (stopped || socket || typeof WebSocket === 'undefined') return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const current = new WebSocket(`${protocol}//${window.location.host}/api/auth/ws`);
      socket = current;
      current.onopen = () => {
        if (!stopped && socket === current) attempts = 0;
      };
      current.onmessage = (event: MessageEvent) => {
        if (stopped || socket !== current) return;
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; user_id?: string };
          if (message?.type === 'session' && message.user_id !== userId) expired();
        } catch {
          // Ignore unknown/malformed messages.
        }
      };
      current.onclose = (event: CloseEvent) => {
        if (stopped || socket !== current) return;
        socket = null;
        if (event.code === 4401) {
          expired();
          return;
        }
        if (document.visibilityState === 'hidden') return;
        const delay = RETRY_MS[Math.min(attempts++, RETRY_MS.length - 1)];
        retry = window.setTimeout(connect, delay);
      };
    }

    function resume() {
      if (document.visibilityState === 'hidden') return;
      void check();
      connect();
    }

    connect();
    // HTTP also covers blocked sockets and apparently-open connections after mobile sleep.
    const interval = window.setInterval(() => void check(), CHECK_MS);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', resume);
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', resume);
      socket?.close();
    };
  }, [userId]);
}
