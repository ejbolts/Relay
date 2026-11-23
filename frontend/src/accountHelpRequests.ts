/**
 * Asking the server's admins for help signing in, from the sign-in screen. There is no email to
 * send anything to, so an admin answers in person. The server answers the same way whatever was
 * typed, so the confirmation repeats what was sent, to let a typo be spotted. Shared by the web's
 * dialogs and the app's sheet.
 */
export interface AccountHelpRequest {
  title: string;
  /** The one field: what identifies the account. */
  label: string;
  name: string;
  autoComplete: 'username' | 'name';
  autoCapitalize: 'none' | 'words';
  maxLength: number;
  /** Shown under the field when it is left empty. */
  emptyError: string;
  /** The value as it is sent and repeated in the confirmation. */
  clean: (value: string) => string;
  path: string;
  body: (value: string) => Record<string, string>;
  submitLabel: string;
  /** Repeats what was sent, so a typo can be spotted. */
  sentTitle: (value: string) => string;
  sentMessage: string;
}

export const PASSWORD_RESET_REQUEST: AccountHelpRequest = {
  title: 'Forgot password',
  label: 'Username',
  name: 'username',
  autoComplete: 'username',
  autoCapitalize: 'none',
  maxLength: 32,
  emptyError: 'Enter your username.',
  clean: (value) => value.trim().toLowerCase(),
  path: '/api/auth/password-reset-request',
  body: (username) => ({ username }),
  submitLabel: 'Ask admin to reset',
  sentTitle: (username) => `Request sent for @${username}`,
  sentMessage: 'Your admin will give you a temporary password.',
};

/** The person gives the name on their profile and an admin tells them the username. */
export const USERNAME_REMINDER_REQUEST: AccountHelpRequest = {
  title: 'Forgot username',
  label: 'Name on your profile',
  name: 'name',
  autoComplete: 'name',
  autoCapitalize: 'words',
  maxLength: 80,
  emptyError: 'Enter your name.',
  clean: (value) => value.trim().replace(/\s+/g, ' '),
  path: '/api/auth/username-reminder-request',
  body: (name) => ({ name }),
  submitLabel: 'Ask admin',
  sentTitle: (name) => `Request sent for ${name}`,
  sentMessage: 'Your admin will tell you your username.',
};
