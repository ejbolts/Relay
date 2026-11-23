// Sign-in, password and profile rules shared by the web and the native app (mobile/). Keep this
// file free of packages and browser APIs: the app bundles it as it is.

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

export const SIGNUP_NAME_HELP = 'Your display name for friends to see on your profile.';
export const SIGNUP_USERNAME_HELP =
  'Used to sign in and shown as your handle so friends can find you. Must be unique.';

export function sampleProfileIdentity(displayName: string, username: string) {
  return {
    display_name: displayName.trim().replace(/\s+/g, ' ') || 'Sam Sample',
    username: username.trim().toLowerCase() || 'sam.sample',
    profile_photo_url: null,
  };
}

export function validateUsername(username: string): string | null {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(username.trim()) ? null : USERNAME_HINT;
}

export function validateAuthForm(
  mode: AuthMode,
  values: AuthFormValues,
  config: { invite_code_required: boolean },
): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const usernameError = validateUsername(values.username);
  if (usernameError) errors.username = usernameError;
  if (mode === 'sign-in') {
    if (!values.password) errors.password = 'Enter your password.';
    return errors;
  }
  const nameError = profileNameError(values.displayName);
  if (nameError) errors.displayName = nameError;
  const passwordError = validateNewPassword(values.password);
  if (passwordError) errors.password = passwordError;
  if (config.invite_code_required && !values.inviteCode.trim()) {
    errors.inviteCode = 'Enter your invite code.';
  }
  return errors;
}

export function registrationFields(values: AuthFormValues) {
  return {
    username: values.username.trim().toLowerCase(),
    password: values.password,
    display_name: values.displayName.trim(),
    invite_code: values.inviteCode.trim() || null,
  };
}

export function registrationFieldErrors(code?: string): AuthFieldErrors {
  switch (code) {
    case 'username_taken':
      return { username: 'This username is already registered.' };
    case 'display_name_taken':
      return { displayName: 'This name is already used.' };
    case 'invalid_invite_code':
      return { inviteCode: 'This invite code was not accepted.' };
    default:
      return {};
  }
}

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
