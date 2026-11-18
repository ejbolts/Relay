import { useEffect, useState } from 'react';
import { useConnectionState } from './connectionStatus';

/** The notice says what happened once, then shrinks to an icon, so it never needs closing. */
export const MINIMISE_AFTER_MS = 4000;

/** What the app-wide connection notice shows, and whether its details are open. */
export function useOfflineNotice() {
  const connection = useConnectionState();
  const offline = connection.phase === 'offline';
  const [minimised, setMinimised] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!offline) {
      // The next outage starts with the full message and closed details.
      setMinimised(false);
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => setMinimised(true), MINIMISE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [offline]);

  return {
    connection,
    visible: offline || connection.phase === 'back',
    minimised: offline && minimised,
    open: offline && open,
    setOpen,
  };
}
