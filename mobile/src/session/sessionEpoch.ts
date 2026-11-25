// The signed-in session's number on this phone. SessionProvider moves it on every sign-in and
// sign-out, so work started for one session can tell, when it finishes, that another has begun
// (useAccountGuard). It never goes back, and survives screens mounting and unmounting.
let epoch = 0;

export const sessionEpoch = () => epoch;

/** Called by SessionProvider whenever a session begins or ends. */
export function nextSessionEpoch() {
  epoch += 1;
}

const SIGN_OUT_CLEANUP_TIMEOUT_MS = 2000;
const beforeSignOutHandlers = new Set<() => void | Promise<void>>();

/**
 * Registers a best-effort cleanup that runs right before sign-out revokes the session token.
 * Never delays sign-out past ~2 s and never blocks sign-out when a cleanup fails.
 */
export function registerBeforeSignOut(handler: () => void | Promise<void>) {
  beforeSignOutHandlers.add(handler);
  return () => {
    beforeSignOutHandlers.delete(handler);
  };
}

/** Runs registered pre-sign-out cleanups best effort, bounded to 2 s. */
export async function runBeforeSignOut(): Promise<void> {
  if (beforeSignOutHandlers.size === 0) return;
  const runs = Array.from(beforeSignOutHandlers).map((handler) =>
    Promise.resolve()
      .then(handler)
      .catch(() => undefined),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(runs),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SIGN_OUT_CLEANUP_TIMEOUT_MS);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
}
