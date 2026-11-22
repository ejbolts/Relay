import { useEffect, useRef } from 'react';
import { useToast } from './Toast';
import type { UpdateCheckStatus } from './useAppUpdates';

export function AppUpdateCheck({
  available,
  status,
  onCheck,
}: {
  available: boolean;
  status: UpdateCheckStatus;
  onCheck: () => void;
}) {
  const requested = useRef(false);
  const { show } = useToast();

  useEffect(() => {
    if (!requested.current || status === 'idle' || status === 'checking') return;
    requested.current = false;
    if (status === 'error') {
      show({
        message: 'Could not check for updates. Check your connection and try again.',
        variant: 'warning',
      });
    } else {
      show(
        available
          ? 'Update available. Use the refresh arrow above when you are ready.'
          : 'Up to date',
      );
    }
  }, [status, available, show]);

  return (
    <div className="release-update-check">
      <button
        type="button"
        className="profile-secondary release-settings-action"
        disabled={status === 'checking'}
        onClick={() => {
          requested.current = true;
          onCheck();
        }}
      >
        {status === 'checking' ? 'Checking for updates…' : 'Check for updates'}
      </button>
    </div>
  );
}
