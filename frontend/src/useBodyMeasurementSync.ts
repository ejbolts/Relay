import { useEffect, useState } from 'react';
import { api } from './api';
import { captureAccountCacheScope } from './accountCacheScope';
import {
  BODY_MEASUREMENT_QUEUE_KEY,
  BODY_MEASUREMENTS_CHANGED,
  bodyMeasurementSyncStatus,
} from './bodyMeasurementStore';
import { useTrainingDataSync } from './useTrainingDataSync';
import type { BodyMeasurement } from './types';

export function useBodyMeasurementSync(
  owner: string | null,
  onChange: (rows: BodyMeasurement[]) => void,
) {
  const [status, setStatus] = useState(bodyMeasurementSyncStatus);
  useEffect(() => {
    if (!owner) return;
    const scope = captureAccountCacheScope();
    let stopped = false;
    const update = () => {
      if (stopped || !scope.isCurrent()) return;
      setStatus(bodyMeasurementSyncStatus());
      void api
        .localBodyMeasurements()
        .then((rows) => {
          if (!stopped && scope.isCurrent()) onChange(rows);
        })
        .catch(() => undefined);
    };
    const changed = (event?: Event) => {
      const rows = (event as CustomEvent<BodyMeasurement[]> | undefined)?.detail;
      if (rows && !stopped && scope.isCurrent()) {
        setStatus(bodyMeasurementSyncStatus());
        onChange(rows);
      } else update();
      void api.syncBodyMeasurements().catch(() => undefined);
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === BODY_MEASUREMENT_QUEUE_KEY || event.key === null) changed();
    };
    update();
    void api.syncBodyMeasurements().catch(() => undefined);
    window.addEventListener(BODY_MEASUREMENTS_CHANGED, changed);
    window.addEventListener('storage', storageChanged);
    return () => {
      stopped = true;
      window.removeEventListener(BODY_MEASUREMENTS_CHANGED, changed);
      window.removeEventListener('storage', storageChanged);
    };
  }, [owner, onChange]);
  useTrainingDataSync(async () => {
    await api.syncBodyMeasurements();
  }, owner !== null);
  return { ...status, retry: () => void api.syncBodyMeasurements(true).catch(() => undefined) };
}
