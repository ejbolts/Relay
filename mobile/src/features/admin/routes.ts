import type { Href } from 'expo-router';

/**
 * The admin console's screens. `account` opens one account directly, for a password reset or
 * username request notice (the bell, or a phone alert's `admin-account` link) to open.
 */
export const adminRoutes = {
  console: '/admin' as Href,
  server: '/admin/server' as Href,
  account: (userId: string) => `/admin/account/${encodeURIComponent(userId)}` as Href,
};
