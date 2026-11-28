import { useEffect, useState } from 'react';
import { MINIMISE_AFTER_MS, offlineNoticeVisible } from './connectionMonitor';
import { useConnectionState } from './connectionStatus';

export { MINIMISE_AFTER_MS } from './connectionMonitor';

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
    visible: offlineNoticeVisible(connection),
    minimised: offline && minimised,
    open: offline && open,
    setOpen,
  };
}
