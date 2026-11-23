import type { User } from '../../../frontend/src/types';
import { apiOrigin } from '../data/api';
import { readJson, writeJson } from '../data/deviceStorage';
import { sessionToken } from '../data/session';

// The account last signed in on this phone, kept with the server it belongs to, so the app can
// open signed in while offline (a live workout must stay reachable without a connection). It
// holds no secret: the session token stays in secure storage, and both must be present.

const KEY = 'relay.signed-in-user.v1';

type Saved = { origin: string; user: User };

function currentOrigin(): string | null {
  try {
    return apiOrigin ? new URL(apiOrigin).origin : null;
  } catch {
    return null;
  }
}

export function rememberUser(user: User) {
  const origin = currentOrigin();
  if (origin) writeJson(KEY, { origin, user } satisfies Saved);
}

export function forgetCachedUser() {
  writeJson(KEY, null);
}

/** The account to open offline: the cached one for this server, while its token is saved. */
export async function offlineUser(): Promise<User | null> {
  const origin = currentOrigin();
  const saved = readJson<Saved>(KEY);
  if (!origin || saved?.origin !== origin || !saved.user?.id) return null;
  return (await sessionToken(origin)) ? saved.user : null;
}
