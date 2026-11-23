import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useOptionalSession } from '../../session/SessionProvider';
import {
  bodyCheckInStatus,
  forgetBodyCheckInCopy,
  localBodyMeasurements,
  setBodyCheckInOwner,
  subscribeBodyCheckIns,
  syncBodyCheckIns,
} from './bodyCheckInQueue';
import { bodyKeys, refreshBodyMeasurements } from './bodyQueries';

/**
 * Sends check-ins saved on this phone whenever it can: on sign-in, on reconnecting and on
 * returning to the app, as the web's useBodyMeasurementSync does. Every screen showing check-ins
 * sees a waiting change at once, and the server's copy once the queue has gone through.
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
    setBodyCheckInOwner(userId);
    const send = () =>
      void syncBodyCheckIns().then(
        (sent) => {
          if (sent > 0 && bodyCheckInStatus().pending === 0) void refreshBodyMeasurements(client);
        },
        () => undefined,
      );
    const unsubscribe = subscribeBodyCheckIns(() => {
      const rows = localBodyMeasurements(userId);
      if (rows) client.setQueryData(bodyKeys.measurements, rows);
    });
    const offline = onlineManager.subscribe((online) => {
      if (online) send();
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') send();
    });
    send();
    return () => {
      unsubscribe();
      offline();
      app.remove();
      setBodyCheckInOwner(null);
    };
  }, [userId, client]);
  return null;
}

/** The queue's count and refusal, kept current. */
export function useBodyCheckInStatus() {
  return useSyncExternalStore(subscribeBodyCheckIns, bodyCheckInStatus);
}
