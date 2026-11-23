import { api, ApiError } from './api';
import {
  authErrorText,
  registrationFieldErrors,
  registrationFields,
  validateAuthForm,
  type AuthFieldErrors,
  type AuthFormValues,
  type AuthMode,
} from './authRules';
import type { AuthConfig, User } from './types';

export {
  MIN_PASSWORD_LENGTH,
  USERNAME_HINT,
  validateAuthForm,
  validateNewPassword,
  validateUsername,
  type AuthFieldErrors,
  type AuthFormValues,
  type AuthMode,
} from './authRules';

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  registration_open: true,
  invite_code_required: false,
};

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
    const created = await endpoints.register(registrationFields(values));
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
      fieldErrors: registrationFieldErrors(code),
      needsInviteCode: code === 'invalid_invite_code',
    };
  }
}
