import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { TipState } from '../../../../frontend/src/tipsState';
import { ApiError, request, serverOrigin } from '../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { useUser } from '../../session/SessionProvider';
import { sessionEpoch } from '../../session/sessionEpoch';
import { startTipSync } from './tips';

/**
 * Saves this phone's tips to the account and resolves with the server's merged copy, or with null
 * when the server predates the tip store. The token is read once and checked against the session
 * the sync began in, so one account's tips are never sent with another account's sign-in.
 */
export async function sendTips(epoch: number, state: TipState): Promise<unknown> {
  const origin = serverOrigin();
  const token = await sessionToken(origin);
  if (!token || sessionEpoch() !== epoch) throw new Error('The session changed.');
  try {
    return await request(
      '/api/tips',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      },
      token,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404 || error.status === 405) return null;
      // The session ended on the server; forget it only if it is still the saved one.
      if (error.status === 401) await forgetSessionTokenIf(origin, token);
    }
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
      send: (state) => sendTips(epoch, state),
      current: () => sessionEpoch() === epoch,
    });
    sync.syncNow();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync.refresh();
    });
    return () => {
      subscription.remove();
      sync.stop();
    };
  }, [account]);
  return null;
}
