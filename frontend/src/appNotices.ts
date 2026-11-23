import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { APP_NOTICES_WAIT_MS, withAppNotices, type AppNotices } from './appNoticeRules';

export { APP_NOTICES_WAIT_MS, releaseAtLeast, type AppNotices } from './appNoticeRules';

export interface AppNoticesState {
  /** True once the account has answered, the request has failed, or the wait has run out. */
  ready: boolean;
  notices: AppNotices | null;
  /** Records a notice as seen for the whole account. Failing quietly leaves this device's memory. */
  record: (change: Partial<AppNotices>) => void;
}

const NO_NOTICES: AppNoticesState = { ready: true, notices: null, record: () => undefined };

export const AppNoticesContext = createContext<AppNoticesState>(NO_NOTICES);
export const useAppNoticesContext = () => useContext(AppNoticesContext);

/**
 * Loads what the account has already seen, so a second device does not repeat What's new or the
 * weekly review. Offline, or if the server is slow, the app carries on with what this device knows.
 */
export function useAppNotices(userId: string | null): AppNoticesState {
  const [state, setState] = useState<{
    userId: string | null;
    ready: boolean;
    notices: AppNotices | null;
  }>({ userId, ready: userId === null, notices: null });
  const current = useRef(userId);
  current.current = userId;

  useEffect(() => {
    if (userId === null) {
      setState({ userId, ready: true, notices: null });
      return;
    }
    let settled = false;
    setState({ userId, ready: false, notices: null });
    const settle = (notices: AppNotices | null) => {
      if (settled || current.current !== userId) return;
      settled = true;
      setState({ userId, ready: true, notices });
    };
    const timer = window.setTimeout(() => settle(null), APP_NOTICES_WAIT_MS);
    void api.getAppNotices().then(settle, () => settle(null));
    return () => {
      settled = true;
      window.clearTimeout(timer);
    };
  }, [userId]);

  const record = useCallback(
    (change: Partial<AppNotices>) => {
      if (userId === null) return;
      setState((previous) =>
        previous.userId === userId
          ? {
              ...previous,
              notices: withAppNotices(previous.notices, change),
            }
          : previous,
      );
      void api.saveAppNotices(change).catch(() => undefined);
    },
    [userId],
  );

  const matches = state.userId === userId;
  return {
    ready: matches ? state.ready : userId === null,
    notices: matches ? state.notices : null,
    record,
  };
}
