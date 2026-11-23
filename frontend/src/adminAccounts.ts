import { formatLastActive, plural, VIDEO_UPLOAD_OPTIONS } from './adminDisplay';
import { SEX_LABELS } from './profileDisplay';
import type {
  AdminUser,
  AppFeedback,
  FriendPresence,
  ServerSettings,
  ServerSettingsUpdate,
  ServerStatus,
  Sex,
} from './types';

// The admin console's account rules, shared by the web and the app.

function waiting(user: AdminUser): boolean {
  return Boolean(user.password_reset_requested_at || user.username_reminder_requested_at);
}

/**
 * Accounts waiting for a password reset or their username first, otherwise in the server's order.
 * Sorted only when the list loads, so a card stays in place after its request is handled until the
 * next refresh.
 */
export function requestsFirst(users: AdminUser[]): AdminUser[] {
  return [...users].sort((a, b) => Number(waiting(b)) - Number(waiting(a)));
}

/** The account with live activity from the socket applied. */
export function withAdminActivity(user: AdminUser, presence: FriendPresence): AdminUser {
  return { ...user, presence, last_active_at: presence.last_active_at };
}

export const ACCOUNT_FILTERS = [
  {
    id: 'reset',
    label: 'Reset requested',
    matches: (user: AdminUser) => !!user.password_reset_requested_at,
  },
  {
    id: 'username',
    label: 'Username requested',
    matches: (user: AdminUser) => !!user.username_reminder_requested_at,
  },
  { id: 'disabled', label: 'Disabled', matches: (user: AdminUser) => user.disabled_at !== null },
  {
    id: 'temporary',
    label: 'Temporary password',
    matches: (user: AdminUser) => user.must_change_password,
  },
] as const;
export type AccountFilter = (typeof ACCOUNT_FILTERS)[number]['id'];

/** Only filters that would find someone, keeping a chosen one until it is cleared. */
export function accountFilterOptions(users: AdminUser[] | null, chosen: AccountFilter | null) {
  return ACCOUNT_FILTERS.filter((option) => option.id === chosen || users?.some(option.matches));
}

/** Accounts whose name or username contains the search words, within the chosen filter. */
export function filterAccounts(
  users: AdminUser[] | null,
  query: string,
  filter: AccountFilter | null,
): AdminUser[] | null {
  const words = query.trim().toLocaleLowerCase();
  const chosen = ACCOUNT_FILTERS.find((option) => option.id === filter);
  return (
    users?.filter(
      (user) =>
        (!words ||
          user.display_name.toLocaleLowerCase().includes(words) ||
          user.username.toLocaleLowerCase().includes(words)) &&
        (!chosen || chosen.matches(user)),
    ) ?? null
  );
}

/** The accounts heading, such as "4 accounts · 1 disabled". */
export function accountsTitle(users: AdminUser[] | null): string {
  if (!users) return 'Accounts';
  const disabled = users.filter((user) => user.disabled_at !== null).length;
  return `${plural(users.length, 'account')}${disabled > 0 ? ` · ${disabled} disabled` : ''}`;
}

/** The badge counting requests still waiting, or null when there are none. */
export function waitingRequestsLabel(users: AdminUser[] | null): string | null {
  const resets = users?.filter((user) => user.password_reset_requested_at).length ?? 0;
  const usernames = users?.filter((user) => user.username_reminder_requested_at).length ?? 0;
  if (resets && usernames) return plural(resets + usernames, 'request');
  if (resets) return plural(resets, 'reset request');
  if (usernames) return plural(usernames, 'username request');
  return null;
}

/** Whether the account shows as online: a disabled account never does. */
export function accountOnline(user: AdminUser): boolean {
  return user.disabled_at === null && Boolean(user.presence?.online);
}

/** The account's live workout, unless it is disabled. */
export function accountLiveWorkout(user: AdminUser) {
  return user.disabled_at === null ? (user.presence?.workout ?? null) : null;
}

/** The short activity line on an account's summary. */
export function accountActivityLabel(user: AdminUser, now: number): string {
  const live = accountLiveWorkout(user);
  if (accountOnline(user)) return live ? `Live · ${live.name}` : 'Active now';
  return formatLastActive(user.last_active_at, new Date(now));
}

/** The releases an account's sign-ins run, such as "v1.4.0 (2 devices)". */
export function accountVersionsLabel(user: AdminUser): string {
  const versions = user.client_versions ?? [];
  if (versions.length)
    return versions
      .map(
        (usage) =>
          `${usage.version ? `v${usage.version}` : 'Not reported'} (${plural(usage.devices, 'device')})`,
      )
      .join(', ');
  return user.signed_in_devices === 0 ? 'No signed-in devices' : 'Not reported';
}

/** A native build such as "ios/1.0.3" as "iOS 1.0.3". */
export function nativeClientLabel(client: string): string {
  const [platform, version] = client.split('/');
  const label = platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : platform;
  return `${label} ${version}`;
}

/** The share of the disk in use, as a whole percentage. */
export function diskUsedPercent(disk: ServerStatus['disk']): number {
  return disk.total_bytes ? Math.round((disk.used_bytes / disk.total_bytes) * 100) : 0;
}

export function registrationSummary(settings: ServerSettings): string {
  if (!settings.allow_registration) return 'Nobody new can create an account';
  return settings.invite_code_required
    ? 'Anyone with the invite code can create an account'
    : 'Anyone can create an account';
}

export function dismissRequestsLabel(user: AdminUser): string {
  return user.password_reset_requested_at && user.username_reminder_requested_at
    ? 'Dismiss requests'
    : 'Dismiss request';
}

/** The account after a password reset: signed out everywhere, on a temporary password. */
export function afterPasswordReset(user: AdminUser): AdminUser {
  return {
    ...user,
    must_change_password: true,
    password_reset_requested_at: null,
    signed_in_devices: 0,
  };
}

export function settingsSavedNotice(update: ServerSettingsUpdate, saved: ServerSettings): string {
  if (update.video_uploads) {
    const label = VIDEO_UPLOAD_OPTIONS.find((option) => option.value === saved.video_uploads);
    return `Video uploads: ${label?.label ?? saved.video_uploads}.`;
  }
  return saved.allow_registration ? 'Sign-ups are open.' : 'Sign-ups are closed.';
}

export function userDisabledNotice(user: AdminUser, disabled: boolean): string {
  return disabled
    ? `${user.display_name} is disabled and signed out.`
    : `${user.display_name} can sign in again.`;
}

export function userSexNotice(user: AdminUser, sex: Sex | null): string {
  return sex
    ? `${user.display_name}’s sex is now ${SEX_LABELS[sex]}.`
    : `${user.display_name} can choose their sex again.`;
}

export function usernameChangedNotice(user: AdminUser): string {
  return `${user.display_name}’s username is now @${user.username}.`;
}

export function feedbackResolvedNotice(item: AppFeedback, resolved: boolean): string {
  return resolved
    ? `Resolved feedback from @${item.username}.`
    : `Reopened feedback from @${item.username}.`;
}

/** Replaces one account in the list with the server's copy. */
export function replaceAccount(users: AdminUser[] | null | undefined, updated: AdminUser) {
  return users ? users.map((row) => (row.id === updated.id ? updated : row)) : users;
}
