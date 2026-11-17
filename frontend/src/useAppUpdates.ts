import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import releaseMetadata from '../release.json';
import {
  checkForAppUpdate,
  isAppUpdateAvailable,
  isAppUpdateRequired,
  refreshApp,
  subscribeAppUpdates,
} from './appUpdates';
import { fetchRelease, watchReleases } from './releaseAnnouncements';
import type { Release } from './releaseMetadata';

export type UpdateCheckStatus = 'idle' | 'checking' | 'current' | 'available' | 'error';

// One primitive snapshot keeps both flags on a single subscription.
const WORKER_AVAILABLE = 1;
const UPDATE_REQUIRED = 2;
function updateState(): number {
  return (
    (isAppUpdateAvailable() ? WORKER_AVAILABLE : 0) | (isAppUpdateRequired() ? UPDATE_REQUIRED : 0)
  );
}

export function useAppUpdates() {
  const state = useSyncExternalStore(subscribeAppUpdates, updateState, () => 0);
  const workerAvailable = (state & WORKER_AVAILABLE) !== 0;
  const required = (state & UPDATE_REQUIRED) !== 0;
  const [availableRelease, setAvailableRelease] = useState<Release | null>(null);
  const [status, setStatus] = useState<UpdateCheckStatus>('idle');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const checking = useRef<Promise<void> | null>(null);
  const available = workerAvailable || availableRelease !== null;

  function acceptRelease(release: Release) {
    setAvailableRelease(release.version !== releaseMetadata.version ? release : null);
    if (release.version !== releaseMetadata.version) {
      void checkForAppUpdate().catch(() => {
        // Keep the notification available; the refresh action can retry the download.
      });
    }
  }

  useEffect(() => watchReleases(acceptRelease), []);

  function check() {
    if (checking.current) return checking.current;
    setStatus('checking');
    const request = (async () => {
      try {
        const [release] = await Promise.all([fetchRelease(), checkForAppUpdate()]);
        if (!release) throw new Error('Release information is unavailable');
        acceptRelease(release);
        setStatus(
          release.version !== releaseMetadata.version || isAppUpdateAvailable()
            ? 'available'
            : 'current',
        );
      } catch {
        setStatus('error');
      } finally {
        checking.current = null;
      }
    })();
    checking.current = request;
    return request;
  }

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshApp();
    } catch (error) {
      setRefreshError(
        error instanceof Error ? error.message : 'Could not refresh. Please try again.',
      );
      setRefreshing(false);
    }
  }

  return {
    available,
    required,
    availableRelease,
    status,
    check,
    refresh,
    refreshing,
    refreshError,
  };
}
