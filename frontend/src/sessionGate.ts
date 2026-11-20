/**
 * Holds changes back while the app is open on a remembered account whose session the server has
 * not confirmed yet.
 *
 * The app opens straight away from what this device saved, before the session check answers. Until
 * it does, nobody knows whether the session still exists or still belongs to that account, so
 * nothing is sent that would change data: a finished workout waiting on the device must never be
 * saved into whichever account the browser's cookie turns out to be for. Reads are not held.
 */

export type SessionConfirmation = 'confirmed' | 'ended';

interface Hold {
  settled: Promise<SessionConfirmation>;
  settle: (outcome: SessionConfirmation) => void;
}

let hold: Hold | null = null;

export interface SessionHold {
  /** The server confirmed the session for the account that is open. */
  confirm: () => void;
  /** The session is gone, or belongs to another account: held changes are refused. */
  end: () => void;
}

/**
 * Starts holding changes until the session is confirmed or found to have ended. Calling it again
 * while a hold is open returns that same hold.
 */
export function holdChangesUntilSessionConfirmed(): SessionHold {
  if (!hold) {
    let settle!: (outcome: SessionConfirmation) => void;
    const settled = new Promise<SessionConfirmation>((resolve) => (settle = resolve));
    hold = { settled, settle };
  }
  const current = hold;
  const finish = (outcome: SessionConfirmation) => {
    if (hold === current) hold = null;
    current.settle(outcome);
  };
  return { confirm: () => finish('confirmed'), end: () => finish('ended') };
}

/** Null when nothing is held; otherwise settles once the open session is confirmed or has ended. */
export function sessionConfirmation(): Promise<SessionConfirmation> | null {
  return hold?.settled ?? null;
}
