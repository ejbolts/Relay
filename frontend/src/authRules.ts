// Sign-in, password and profile rules shared by the web and the native app (mobile/). Keep this
// file free of packages and browser APIs: the app bundles it as it is.

export const MIN_PASSWORD_LENGTH = 10;

export function validateNewPassword(password: string): string | null {
  return password.length >= MIN_PASSWORD_LENGTH
    ? null
    : `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
}

export interface PasswordChangeFields {
  current: string;
  next: string;
  confirm: string;
}

/**
 * The first problem with a password change, or null when it can be sent. After an admin reset
 * the current password is the temporary one the person was given.
 */
export function passwordChangeError(
  fields: PasswordChangeFields,
  { temporary = false }: { temporary?: boolean } = {},
): string | null {
  if (!fields.current)
    return temporary ? 'Enter the temporary password.' : 'Enter your current password.';
  const passwordError = validateNewPassword(fields.next);
  if (passwordError) return `New password: ${passwordError.toLowerCase()}`;
  if (fields.next !== fields.confirm) return 'The new passwords do not match.';
  return null;
}

/** An answer from the server: its HTTP status, the error code it sent and its message. */
export interface ServerError {
  status: number;
  code?: string;
  message: string;
}

/** Friendly, specific copy for each error code the auth and profile endpoints can return. */
export function authErrorText(error: ServerError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'That username and password do not match. Check them and try again.';
    case 'too_many_attempts':
      return 'Too many attempts. Wait a few minutes before trying again.';
    case 'username_taken':
      return 'An account with that username already exists. Try signing in instead.';
    case 'display_name_taken':
      return 'Another account already uses that name. Add a surname, initial or nickname.';
    case 'username_locked':
      return 'Only an administrator can change your username.';
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
  if (error.status === 422) return 'Check your details and try again.';
  if (error.status === 429) return 'Too many attempts. Wait a few minutes before trying again.';
  if (error.status >= 500) return 'The server had a problem. Try again in a moment.';
  return error.message;
}

/** In Settings the current password is the one being checked, so say so. */
export function passwordChangeFailureText(error: ServerError): string {
  return error.code === 'invalid_password'
    ? 'Your current password is not correct.'
    : authErrorText(error);
}

/** Upload refusals whose server message already says what to do with the photo. */
export const PROFILE_PHOTO_ERRORS = new Set([
  'invalid_photo',
  'unsupported_photo_type',
  'photo_too_large',
  'photo_dimensions_too_large',
]);

/** The first problem with a profile edit, or null when it can be saved. */
export function profileNameError(displayName: string): string | null {
  return displayName.trim() ? null : 'Enter a name to show in the app.';
}
