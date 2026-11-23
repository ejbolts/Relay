// The signed-in session's number on this phone. SessionProvider moves it on every sign-in and
// sign-out, so work started for one session can tell, when it finishes, that another has begun
// (useAccountGuard). It never goes back, and survives screens mounting and unmounting.
let epoch = 0;

export const sessionEpoch = () => epoch;

/** Called by SessionProvider whenever a session begins or ends. */
export function nextSessionEpoch() {
  epoch += 1;
}
