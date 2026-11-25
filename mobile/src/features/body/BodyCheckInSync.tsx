import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { TRAINING_SYNC_INTERVAL_MS } from '../../../../frontend/src/trainingSync';
import { useOptionalSession } from '../../session/SessionProvider';
import {
  bodyCheckInHasSendable,
  bodyCheckInStatus,
  bodyCheckInSyncFailed,
  bodyCheckInSyncing,
  forgetBodyCheckInCopy,
  localBodyMeasurements,
  setBodyCheckInOwner,
  subscribeBodyCheckIns,
  syncBodyCheckIns,
} from './bodyCheckInQueue';
import { bodyKeys, refreshBodyMeasurements } from './bodyQueries';

/**
 * The single mounted BodyCheckInSync owner's retry callback, so tapping Retry sync on any tab
 * runs through the one owner and refreshes queries for that session when the queue drains.
 */
let activeRetry: (() => Promise<number>) | null = null;

/** Retries waiting and refused check-ins through the mounted owner (or directly in unit tests). */
export function retryBodyCheckIns(): Promise<number> {
  return activeRetry ? activeRetry() : syncBodyCheckIns(true).catch(() => 0);
}

/**
 * Sends check-ins saved on this phone whenever it can: on sign-in, on reconnecting and on
 * returning to the app, as the web's useBodyMeasurementSync does. Those send at once; the timed
 * sends in between wait out the pause that follows sends the server did not answer. Every screen
 * showing check-ins sees a waiting change at once, and the server's copy once the queue has gone
 * through.
 */
export function BodyCheckInSync() {
  const client = useQueryClient();
  const status = useOptionalSession()?.status;
  const userId = status?.kind === 'signed-in' ? status.user.id : null;
  const signedOut = status?.kind === 'signed-out';

  useEffect(() => {
    if (signedOut) forgetBodyCheckInCopy();
  }, [signedOut]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let inFlight = 0;
    let appActive = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let timer: ReturnType<typeof setInterval> | null = null;
    setBodyCheckInOwner(userId);
    const syncTimer = () => {
      const want = active && appActive && (bodyCheckInHasSendable() || bodyCheckInSyncFailed());
      if (want && !timer) {
        timer = setInterval(() => {
          if (
            !active ||
            !appActive ||
            inFlight > 0 ||
            bodyCheckInSyncing() ||
            (!bodyCheckInHasSendable() && !bodyCheckInSyncFailed())
          )
            return;
          void send();
        }, TRAINING_SYNC_INTERVAL_MS);
      } else if (!want && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const send = (retry = false, immediate = false) => {
      inFlight += 1;
      return syncBodyCheckIns(retry, immediate)
        .then(
          (sent) => {
            if (active && sent > 0 && bodyCheckInStatus().pending === 0)
              void refreshBodyMeasurements(client);
            return sent;
          },
          () => 0,
        )
        .finally(() => {
          inFlight -= 1;
          syncTimer();
        });
    };
    activeRetry = () => send(true);
    const unsubscribe = subscribeBodyCheckIns(() => {
      if (!active) return;
      syncTimer();
      const rows = localBodyMeasurements(userId);
      if (rows) client.setQueryData(bodyKeys.measurements, rows);
    });
    const offline = onlineManager.subscribe((online) => {
      if (online) void send(false, true);
    });
    const app = AppState.addEventListener('change', (state) => {
      appActive = state === 'active';
      syncTimer();
      if (state === 'active') void send(false, true);
    });
    syncTimer();
    void send(false, true);
    return () => {
      active = false;
      activeRetry = null;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      unsubscribe();
      offline();
      app?.remove();
      setBodyCheckInOwner(null);
    };
  }, [userId, client]);
  return null;
}

/** The queue's count and refusal, kept current. */
export function useBodyCheckInStatus() {
  return useSyncExternalStore(subscribeBodyCheckIns, bodyCheckInStatus);
}

/** Whether a connection or server failure left pending check-ins waiting for a retry. */
export function useBodyCheckInSyncFailed() {
  return useSyncExternalStore(subscribeBodyCheckIns, bodyCheckInSyncFailed);
}
