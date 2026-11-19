/** Why the sign-in screen is showing, when the person did not choose to sign out here. */
export type SignInNotice = 'signed-out' | 'signed-out-workout-saved' | 'account-deleted';

export function signInNoticeText(notice: SignInNotice): string {
  switch (notice) {
    case 'signed-out':
      return 'You were signed out.';
    case 'signed-out-workout-saved':
      return 'You were signed out. Your workout is saved.';
    case 'account-deleted':
      return 'Your account was deleted.';
  }
}

// Deleting the account reloads the app, so the notice waits in this tab's session storage.
const ACCOUNT_DELETED_KEY = 'relay.account-deleted';

export function rememberAccountDeleted(): void {
  try {
    window.sessionStorage.setItem(ACCOUNT_DELETED_KEY, '1');
  } catch {
    // Without storage the sign-in screen just opens without the notice.
  }
}

/** True once after the account was deleted in this tab. */
export function takeAccountDeleted(): boolean {
  try {
    const deleted = window.sessionStorage.getItem(ACCOUNT_DELETED_KEY) === '1';
    window.sessionStorage.removeItem(ACCOUNT_DELETED_KEY);
    return deleted;
  } catch {
    return false;
  }
}
