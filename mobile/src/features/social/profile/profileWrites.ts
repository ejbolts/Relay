import type { Sex, User } from '../../../../../frontend/src/types';
import { ApiError, request, serverOrigin } from '../../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../../data/session';
import { uploadFile } from '../../../data/uploadFile';
import { isToastAccountCurrent } from '../../../ui/Toast';

/** The session a profile edit was started in, with the token its writes are sent with. */
export type ProfileSession = { account: string; origin: string; token: string };

/** The session has no token left, as after a refused save: the editor says so beside Save. */
export const SIGN_IN_TO_CONTINUE = 'Sign in to continue.';

/**
 * The token of the session `account` (from `toastAccount()`) names, or null once another
 * session, or none, has taken over: a draft started in one account is never sent with another's.
 * Still the same account but without a token (a refusal forgot it) is an error to show, not a
 * silent no-op.
 */
export async function profileSession(account: string): Promise<ProfileSession | null> {
  if (!isToastAccountCurrent(account)) return null;
  const origin = serverOrigin();
  const token = await sessionToken(origin);
  if (!isToastAccountCurrent(account)) return null;
  if (!token) throw new ApiError(401, SIGN_IN_TO_CONTINUE);
  return { account, origin, token };
}

/**
 * Sends one write with the session's own token, answering null when the session changed before
 * or while it ran. A refusal forgets only that token, so a later account's token survives.
 */
async function bound<T>(session: ProfileSession, send: (token: string) => Promise<T>) {
  if (!isToastAccountCurrent(session.account)) return null;
  try {
    const result = await send(session.token);
    return isToastAccountCurrent(session.account) ? result : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401)
      await forgetSessionTokenIf(session.origin, session.token);
    throw error;
  }
}

/** Name and (once) sex, as Settings' `updateProfile` sends them. */
export const saveProfileDetails = (
  session: ProfileSession,
  changes: { display_name?: string; sex?: Sex },
) =>
  bound(session, (token) =>
    request<User>(
      '/api/profile',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      },
      token,
    ),
  );

/** A photo picked on the phone, as Settings' `uploadProfilePhoto` sends it. */
export const saveProfilePhoto = (
  session: ProfileSession,
  photo: { uri: string; mimeType?: string | null },
) => {
  const type = photo.mimeType ?? 'image/jpeg';
  const extension = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  return bound(session, (token) =>
    uploadFile<User>(
      '/api/profile/photo',
      'PUT',
      { uri: photo.uri, name: `profile.${extension}`, type },
      { token },
    ),
  );
};

export const deleteProfilePhoto = (session: ProfileSession) =>
  bound(session, (token) => request<User>('/api/profile/photo', { method: 'DELETE' }, token));
