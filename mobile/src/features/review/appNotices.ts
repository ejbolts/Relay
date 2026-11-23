import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  APP_NOTICES_WAIT_MS,
  withAppNotices,
  type AppNotices,
} from '../../../../frontend/src/appNoticeRules';
import { apiGet, apiSend } from '../../data/api';

export const appNoticeKeys = { all: ['app-notices'] as const };

/**
 * What the account has already seen on any device, so this phone doesn't repeat What's new or
 * the weekly review. Offline, or if the server is slow, the app goes by what the phone knows.
 */
export function useAppNotices(): { ready: boolean; notices: AppNotices | null } {
  const query = useQuery({
    queryKey: appNoticeKeys.all,
    queryFn: ({ signal }) => apiGet<AppNotices>('/api/app-notices', signal),
    staleTime: 5 * 60_000,
  });
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), APP_NOTICES_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  return { ready: query.isFetched || waited, notices: query.data ?? null };
}

/** Records a notice as seen for the whole account. Failing quietly leaves the phone's memory. */
export function recordAppNotices(client: QueryClient, change: Partial<AppNotices>) {
  client.setQueryData<AppNotices>(appNoticeKeys.all, (current) => withAppNotices(current, change));
  void apiSend<AppNotices>('/api/app-notices', 'PUT', change).then(
    (saved) => client.setQueryData(appNoticeKeys.all, saved),
    () => undefined,
  );
}
