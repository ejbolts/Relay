import { useEffect, useState } from 'react';

// Automated emulator checks read the screen with uiautomator, which waits for the UI to go idle;
// a clock redrawing every second never lets it. A test Expo server started with
// EXPO_PUBLIC_RELAY_TEST_SLOW_CLOCK=1 makes every clock tick every 30 s instead. Never set it for
// real use.
const SLOW_CLOCK = process.env.EXPO_PUBLIC_RELAY_TEST_SLOW_CLOCK === '1';

/** The current time, refreshed every `intervalMs` while mounted. Use it for every live clock. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Date.now()),
      SLOW_CLOCK ? Math.max(intervalMs, 30_000) : intervalMs,
    );
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
