import { api, ApiError } from './api';
import type { AuthConfig, User } from './types';

export const MIN_PASSWORD_LENGTH = 10;
export const USERNAME_HINT =
  '3–32 letters, numbers, dots, underscores or hyphens. Start with a letter or number.';

export type AuthMode = 'sign-in' | 'create-account';

export interface AuthFormValues {
  displayName: string;
  username: string;
  password: string;
  inviteCode: string;
}

export type AuthFieldErrors = Partial<Record<keyof AuthFormValues, string>>;

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  registration_open: true,
  invite_code_required: false,
};

const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;

export function isNetworkFailure(reason: unknown): boolean {
  if (reason instanceof ApiError) return reason.status === 0 && reason.code === 'request_failed';
  return reason instanceof TypeError;
}

/** Friendly, specific copy for each error code the auth and profile endpoints can return. */
export function authErrorMessage(reason: unknown): string {
  if (isNetworkFailure(reason)) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  if (reason instanceof ApiError) {
    switch (reason.code) {
      case 'invalid_credentials':
        return 'That username and password do not match. Check them and try again.';
      case 'too_many_attempts':
        return 'Too many attempts. Wait a few minutes before trying again.';
      case 'username_taken':
        return 'An account with that username already exists. Try signing in instead.';
      case 'registration_closed':
        return 'New accounts are not being accepted right now.';
      case 'setup_required':
        return 'This server is not set up yet. Its owner needs to set an invite code or create the first account.';
      case 'invalid_invite_code':
        return 'That invite code is not valid. Check it and try again.';
      case 'invalid_password':
        return 'That password is not correct.';
      case 'password_unchanged':
        return 'Choose a different password from the temporary one.';
      case 'account_disabled':
        return 'This account has been disabled. Contact the person who runs this server.';
      case 'not_authenticated':
        return 'Your session has ended. Sign in again to continue.';
    }
    if (reason.status === 422) return 'Check your details and try again.';
    if (reason.status === 429) return 'Too many attempts. Wait a few minutes before trying again.';
    if (reason.status >= 500) return 'The server had a problem. Try again in a moment.';
    return reason.message;
  }
  return reason instanceof Error ? reason.message : 'Something went wrong. Try again.';
}

export function validateUsername(username: string): string | null {
  return USERNAME_PATTERN.test(username.trim()) ? null : USERNAME_HINT;
}

export function validateNewPassword(password: string): string | null {
  return password.length >= MIN_PASSWORD_LENGTH
    ? null
    : `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
}

export function validateAuthForm(
  mode: AuthMode,
  values: AuthFormValues,
  config: AuthConfig,
): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const usernameError = validateUsername(values.username);
  if (usernameError) errors.username = usernameError;
  if (mode === 'sign-in') {
    if (!values.password) errors.password = 'Enter your password.';
    return errors;
  }
  if (!values.displayName.trim()) errors.displayName = 'Enter a name to show in the app.';
  const passwordError = validateNewPassword(values.password);
  if (passwordError) errors.password = passwordError;
  if (config.invite_code_required && !values.inviteCode.trim()) {
    errors.inviteCode = 'Enter your invite code.';
  }
  return errors;
}

export interface AuthApi {
  login: typeof api.auth.login;
  register: typeof api.auth.register;
}

export type AuthSubmitResult =
  | { ok: true; user: User }
  | {
      ok: false;
      message: string;
      fieldErrors: AuthFieldErrors;
      /** The server wants an invite code even though the config said it did not. */
      needsInviteCode: boolean;
    };

/** Validates the form, calls the matching endpoint, and turns any failure into display copy. */
export async function submitAuthForm(
  mode: AuthMode,
  values: AuthFormValues,
  config: AuthConfig,
  endpoints: AuthApi = api.auth,
): Promise<AuthSubmitResult> {
  const fieldErrors = validateAuthForm(mode, values, config);
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: 'Fix the highlighted fields and try again.',
      fieldErrors,
      needsInviteCode: false,
    };
  }
  try {
    const username = values.username.trim().toLowerCase();
    const user =
      mode === 'sign-in'
        ? await endpoints.login({ username, password: values.password })
        : await endpoints.register({
            username,
            password: values.password,
            display_name: values.displayName.trim(),
            invite_code: values.inviteCode.trim() || null,
          });
    return { ok: true, user };
  } catch (reason) {
    const code = reason instanceof ApiError ? reason.code : '';
    return {
      ok: false,
      message: authErrorMessage(reason),
      fieldErrors:
        code === 'username_taken'
          ? { username: 'This username is already registered.' }
          : code === 'invalid_invite_code'
            ? { inviteCode: 'This invite code was not accepted.' }
            : {},
      needsInviteCode: code === 'invalid_invite_code',
    };
  }
}
