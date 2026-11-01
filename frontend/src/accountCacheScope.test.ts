// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureAccountCacheScope } from './accountCacheScope';
import { LAST_USER_KEY } from './deviceAccount';
import { clearOffline, indexedDbBackend, replaceOfflineBackend } from './offlineStore';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import type { DashboardData } from './types';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  replaceOfflineBackend(indexedDbBackend);
  localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: 'A', display_name: 'Sample A' }));
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('never lets a late dashboard overwrite the new account snapshot', async () => {
  const scopeA = captureAccountCacheScope();
  await clearOffline();
  localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: 'B', display_name: 'Sample B' }));
  const b = { marker: 'Sample B data' } as unknown as DashboardData;
  await writeDashboardCache(b);
  await writeDashboardCache({ marker: 'Sample A data' } as unknown as DashboardData, scopeA);
  expect(await readDashboardCache()).toEqual(b);
});

it('invalidates another tab on logout, while profile-only changes keep the scope', () => {
  const scope = captureAccountCacheScope();
  const oldValue = localStorage.getItem(LAST_USER_KEY);
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: LAST_USER_KEY,
      oldValue,
      newValue: JSON.stringify({ id: 'A', display_name: 'Updated name' }),
    }),
  );
  expect(scope.isCurrent()).toBe(true);
  window.dispatchEvent(
    new StorageEvent('storage', { key: LAST_USER_KEY, oldValue, newValue: null }),
  );
  expect(scope.isCurrent()).toBe(false);
});
