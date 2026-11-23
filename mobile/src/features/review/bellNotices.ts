import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import type { AppNoticeRows } from '../../../../frontend/src/notificationInbox';
import type { PasswordResetRequest, UsernameReminderRequest } from '../../../../frontend/src/types';
import { apiGet } from '../../data/api';
import { useUser } from '../../session/SessionProvider';
import { useReleaseNotice } from './useReleaseNotice';
import { useWeeklyReview } from './useWeeklyReview';

const NO_REQUESTS: PasswordResetRequest[] = [];

/** People waiting for an administrator, read every 30 seconds while the bell is on screen. */
function useAdminRequests<T>(path: string, enabled: boolean, focused: boolean) {
  return useQuery({
    queryKey: ['admin-requests', path],
    queryFn: ({ signal }) => apiGet<T[]>(path, signal),
    enabled,
    refetchInterval: enabled && focused ? 30_000 : false,
  });
}

/**
 * The bell's notices from the app itself: the running release, last week's review while it's
 * available and, for administrators, password reset and username requests until they're handled.
 */
export function useBellNotices(): { rows: AppNoticeRows; readRelease: () => void } {
  const admin = useUser().is_admin === true;
  const focused = useIsFocused();
  const release = useReleaseNotice();
  const review = useWeeklyReview();
  const resets = useAdminRequests<PasswordResetRequest>(
    '/api/admin/password-reset-requests',
    admin,
    focused,
  );
  const usernames = useAdminRequests<UsernameReminderRequest>(
    '/api/admin/username-reminder-requests',
    admin,
    focused,
  );
  return {
    rows: {
      release: release.release ?? undefined,
      releaseUnread: release.noticeUnread,
      weeklyReview: review.notice,
      resetRequests: (admin && resets.data) || NO_REQUESTS,
      usernameRequests: (admin && usernames.data) || NO_REQUESTS,
    },
    readRelease: release.readNotice,
  };
}
