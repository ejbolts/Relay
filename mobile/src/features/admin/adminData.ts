import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { requestsFirst, withAdminActivity } from '../../../../frontend/src/adminAccounts';
import type {
  AccountLimits,
  AccountLimitsSettings,
  AdminUser,
  AppFeedback,
  ServerSettings,
  ServerSettingsUpdate,
  ServerStatus,
  Sex,
  User,
} from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { onAdminActivity } from '../../data/livePresence';

/** The admin console's reads, from the same endpoints as the web's. */
export const adminKeys = {
  all: ['admin'] as const,
  users: ['admin', 'users'] as const,
  feedback: ['admin', 'feedback'] as const,
  settings: ['admin', 'settings'] as const,
  status: ['admin', 'status'] as const,
  limits: ['admin', 'limits'] as const,
};

const user = (id: string) => `/api/admin/users/${encodeURIComponent(id)}`;

export const adminApi = {
  // Sorted only when the list loads, so a card keeps its place after its request is handled.
  users: (signal?: AbortSignal) =>
    apiGet<AdminUser[]>('/api/admin/users', signal).then(requestsFirst),
  feedback: (signal?: AbortSignal) => apiGet<AppFeedback[]>('/api/admin/feedback', signal),
  settings: (signal?: AbortSignal) => apiGet<ServerSettings>('/api/admin/settings', signal),
  status: (signal?: AbortSignal) => apiGet<ServerStatus>('/api/admin/status', signal),
  limits: (signal?: AbortSignal) => apiGet<AccountLimitsSettings>('/api/admin/limits', signal),
  setDisabled: (id: string, disabled: boolean) =>
    apiSend<AdminUser>(user(id), 'PATCH', { disabled }),
  setSex: (id: string, sex: Sex | null) => apiSend<AdminUser>(`${user(id)}/sex`, 'PUT', { sex }),
  setUsername: (id: string, username: string) =>
    apiSend<AdminUser>(`${user(id)}/username`, 'PUT', { username }),
  resetPassword: (id: string) =>
    apiSend<{ temporary_password: string }>(`${user(id)}/reset-password`, 'POST'),
  dismissPasswordReset: (id: string) =>
    apiSend<void>(`/api/admin/password-reset-requests/${encodeURIComponent(id)}`, 'DELETE'),
  dismissUsernameReminder: (id: string) =>
    apiSend<void>(`/api/admin/username-reminder-requests/${encodeURIComponent(id)}`, 'DELETE'),
  updateSettings: (update: ServerSettingsUpdate) =>
    apiSend<ServerSettings>('/api/admin/settings', 'PATCH', update),
  updateLimits: (values: AccountLimits) =>
    apiSend<AccountLimitsSettings>('/api/admin/limits', 'PUT', values),
  setFeedbackResolved: (id: string, resolved: boolean) =>
    apiSend<AppFeedback>(`/api/admin/feedback/${encodeURIComponent(id)}`, 'PATCH', { resolved }),
  me: () => apiGet<User>('/api/auth/me'),
};

export function useAdminUsers() {
  return useQuery({ queryKey: adminKeys.users, queryFn: ({ signal }) => adminApi.users(signal) });
}
export function useAdminFeedback() {
  return useQuery({
    queryKey: adminKeys.feedback,
    queryFn: ({ signal }) => adminApi.feedback(signal),
  });
}
export function useServerSettings() {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: ({ signal }) => adminApi.settings(signal),
  });
}
export function useServerStatus() {
  return useQuery({ queryKey: adminKeys.status, queryFn: ({ signal }) => adminApi.status(signal) });
}
export function useAccountLimits() {
  return useQuery({ queryKey: adminKeys.limits, queryFn: ({ signal }) => adminApi.limits(signal) });
}

/** Changes one account in the cached list, keeping its place. */
export function patchAccount(
  client: QueryClient,
  id: string,
  change: (account: AdminUser) => AdminUser,
) {
  client.setQueryData<AdminUser[]>(adminKeys.users, (current) =>
    current?.map((row) => (row.id === id ? change(row) : row)),
  );
}

/**
 * While the console is open: the socket's live activity updates the account cards in place (never
 * the editable settings), and the list reloads when the socket subscribes again or the app comes
 * back to the foreground, as the web reloads on focus.
 */
export function useAdminActivity() {
  const client = useQueryClient();
  useEffect(() => {
    const reload = () => void client.invalidateQueries({ queryKey: adminKeys.users });
    const stop = onAdminActivity((activity) => {
      if (!activity) {
        reload();
        return;
      }
      patchAccount(client, activity.userId, (account) =>
        withAdminActivity(account, activity.presence),
      );
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });
    return () => {
      stop();
      app.remove();
    };
  }, [client]);
}
