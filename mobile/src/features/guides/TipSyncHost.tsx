import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { TipState } from '../../../../frontend/src/tipsState';
import {
  TIP_ACCOUNT_MISMATCH,
  TIP_SYNC_REFUSED,
  TipSyncBusy,
  tipSyncPath,
} from '../../../../frontend/src/tipSync';
import { ApiError, request, serverOrigin } from '../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { useUser } from '../../session/SessionProvider';
import { sessionEpoch } from '../../session/sessionEpoch';
import { startTipSync } from './tips';

/**
 * Saves this phone's copy of `account`'s tips and resolves with the server's reply; with null when
 * the server predates the tip store; or with TIP_SYNC_REFUSED when it refuses them for another
 * account. A busy server throws TipSyncBusy, for the sync to retry. The token is read once and
 * checked against the session the sync began in, and the request names the account, so one
 * account's tips are never saved into another.
 */
export async function sendTips(
  epoch: number,
  account: string,
  state: TipState,
  generation: string,
): Promise<unknown> {
  const origin = serverOrigin();
  const token = await sessionToken(origin);
  if (!token || sessionEpoch() !== epoch) throw new Error('The session changed.');
  try {
    return await request(
      tipSyncPath(account, generation),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      },
      token,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === TIP_ACCOUNT_MISMATCH) return TIP_SYNC_REFUSED;
      if (error.status === 404 || error.status === 405) return null;
      if (error.status === 503 || error.status === 429) throw new TipSyncBusy();
      // The session ended on the server; forget it only if it is still the saved one.
      if (error.status === 401) await forgetSessionTokenIf(origin, token);
      throw error;
    }
    // A network error while online (e.g. server restarting or unreachable): retry with the
    // sync's 2, 5, 15 s backoff; true offline waits for onlineManager to go online.
    if (onlineManager.isOnline()) throw new TipSyncBusy();
    throw error;
  }
}

/**
 * Keeps the signed-in account's tips in step with the server and the web: on sign-in, on coming
 * back to the app, and after each change on this phone. Older servers leave tips on the phone.
 */
export function TipSyncHost() {
  const account = useUser().id;
  useEffect(() => {
    const epoch = sessionEpoch();
    const sync = startTipSync(account, {
      send: (state, generation) => sendTips(epoch, account, state, generation),
      current: () => sessionEpoch() === epoch,
    });
    sync.syncNow();
    const online = onlineManager.subscribe((isOnline) => {
      if (isOnline) sync.refresh();
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync.refresh();
    });
    return () => {
      online();
      subscription.remove();
      sync.stop();
    };
  }, [account]);
  return null;
}
