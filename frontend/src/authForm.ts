import { api, ApiError } from './api';
import { authErrorText, validateNewPassword } from './authRules';
import type { AuthConfig, User } from './types';

export { MIN_PASSWORD_LENGTH, validateNewPassword } from './authRules';

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
  if (reason instanceof ApiError) return authErrorText(reason);
  return reason instanceof Error ? reason.message : 'Something went wrong. Try again.';
}

export function validateUsername(username: string): string | null {
  return USERNAME_PATTERN.test(username.trim()) ? null : USERNAME_HINT;
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
  | {
      ok: true;
      user: User;
      /** The account was created, but signing in to it straight afterwards failed. */
      needsSignIn?: true;
    }
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
    if (mode === 'sign-in') {
      return { ok: true, user: await endpoints.login({ username, password: values.password }) };
    }
    const created = await endpoints.register({
      username,
      password: values.password,
      display_name: values.displayName.trim(),
      invite_code: values.inviteCode.trim() || null,
    });
    // Registering does not start a session, so sign in to the new account with the same details.
    try {
      return { ok: true, user: await endpoints.login({ username, password: values.password }) };
    } catch {
      return { ok: true, user: created, needsSignIn: true };
    }
  } catch (reason) {
    const code = reason instanceof ApiError ? reason.code : '';
    return {
      ok: false,
      message: authErrorMessage(reason),
      fieldErrors:
        code === 'username_taken'
          ? { username: 'This username is already registered.' }
          : code === 'display_name_taken'
            ? { displayName: 'This name is already used.' }
            : code === 'invalid_invite_code'
              ? { inviteCode: 'This invite code was not accepted.' }
              : {},
      needsInviteCode: code === 'invalid_invite_code',
    };
  }
}
