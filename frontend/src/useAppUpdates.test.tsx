// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import metadata from '../release.json';
import {
  checkForAppUpdate,
  isAppUpdateAvailable,
  refreshApp,
  subscribeAppUpdates,
} from './appUpdates';
import { fetchRelease, watchReleases } from './releaseAnnouncements';
import type { Release } from './releaseMetadata';
import { useAppUpdates } from './useAppUpdates';

vi.mock('./appUpdates', () => ({
  checkForAppUpdate: vi.fn(),
  isAppUpdateAvailable: vi.fn(),
  refreshApp: vi.fn(),
  subscribeAppUpdates: vi.fn(),
}));
vi.mock('./releaseAnnouncements', () => ({ fetchRelease: vi.fn(), watchReleases: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
let updates: ReturnType<typeof useAppUpdates>;
let receiveRelease: (release: Release) => void;
let workerAvailable: boolean;
let notifyWorker: (() => void) | undefined;
let stopWatching = vi.fn<() => void>();
let stopWorker = vi.fn<() => void>();
const nextRelease: Release = { ...metadata, version: '99.0.0', title: 'Next sample release' };

function Harness() {
  updates = useAppUpdates();
  return <p>{updates.available ? 'Update available' : 'Current app'}</p>;
}

async function mount() {
  await act(async () => root.render(<Harness />));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  workerAvailable = false;
  notifyWorker = undefined;
  stopWatching = vi.fn<() => void>();
  stopWorker = vi.fn<() => void>();
  vi.mocked(isAppUpdateAvailable).mockImplementation(() => workerAvailable);
  vi.mocked(subscribeAppUpdates).mockImplementation((listener) => {
    notifyWorker = listener;
    return stopWorker;
  });
  vi.mocked(watchReleases).mockImplementation((listener) => {
    receiveRelease = listener;
    return stopWatching;
  });
  vi.mocked(fetchRelease).mockResolvedValue(metadata);
  vi.mocked(checkForAppUpdate).mockResolvedValue(undefined);
  vi.mocked(refreshApp).mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('available app updates', () => {
  it('notifies an already open app about a deployed release without refreshing it', async () => {
    await mount();
    expect(updates.available).toBe(false);
    await act(async () => receiveRelease(nextRelease));
    expect(container.textContent).toBe('Update available');
    expect(updates.availableRelease).toEqual(nextRelease);
    expect(updates.status).toBe('idle');
    expect(refreshApp).not.toHaveBeenCalled();

    // A rollback to the release this page is already running needs no refresh.
    await act(async () => receiveRelease(metadata));
    expect(updates.available).toBe(false);
    expect(updates.availableRelease).toBeNull();
  });

  it('offers a worker-only update even when the application release version is unchanged', async () => {
    await mount();
    await act(async () => {
      workerAvailable = true;
      notifyWorker!();
    });
    expect(updates.available).toBe(true);
    expect(updates.availableRelease).toBeNull();
    expect(refreshApp).not.toHaveBeenCalled();
    await act(async () => updates.check());
    expect(updates.status).toBe('available');

    await act(async () => {
      workerAvailable = false;
      notifyWorker!();
    });
    expect(updates.available).toBe(false);
    await act(async () => root.unmount());
    expect(stopWatching).toHaveBeenCalledOnce();
    expect(stopWorker).toHaveBeenCalledOnce();
  });
});

describe('manual update checks', () => {
  it('shows checking until both checks finish and combines duplicate requests', async () => {
    let resolveRelease!: (release: Release) => void;
    let resolveWorker!: () => void;
    vi.mocked(fetchRelease).mockReturnValue(new Promise((resolve) => (resolveRelease = resolve)));
    vi.mocked(checkForAppUpdate).mockReturnValue(
      new Promise((resolve) => (resolveWorker = resolve)),
    );
    await mount();
    let request!: Promise<void>;
    let duplicate!: Promise<void>;
    await act(async () => {
      request = updates.check();
      duplicate = updates.check();
    });
    expect(request).toBe(duplicate);
    expect(updates.status).toBe('checking');
    expect(fetchRelease).toHaveBeenCalledOnce();
    expect(checkForAppUpdate).toHaveBeenCalledOnce();

    await act(async () => resolveRelease(nextRelease));
    expect(updates.status).toBe('checking');
    await act(async () => {
      resolveWorker();
      await request;
    });
    expect(updates.status).toBe('available');
    expect(updates.availableRelease).toEqual(nextRelease);
    expect(refreshApp).not.toHaveBeenCalled();
  });

  it('reports that the installed app is current after a successful manual check', async () => {
    await mount();
    await act(async () => updates.check());
    expect(updates.status).toBe('current');
    expect(updates.available).toBe(false);
    expect(fetchRelease).toHaveBeenCalledOnce();
    expect(checkForAppUpdate).toHaveBeenCalledOnce();
  });

  it.each(['missing metadata', 'offline metadata', 'worker check failed'])(
    'reports %s without clearing a known available release',
    async (failure) => {
      await mount();
      await act(async () => receiveRelease(nextRelease));
      if (failure === 'missing metadata') vi.mocked(fetchRelease).mockResolvedValue(null);
      else if (failure === 'offline metadata') {
        vi.mocked(fetchRelease).mockRejectedValue(new Error('Offline'));
      } else vi.mocked(checkForAppUpdate).mockRejectedValue(new Error('Worker unavailable'));

      await act(async () => updates.check());
      expect(updates.status).toBe('error');
      expect(updates.available).toBe(true);
      expect(updates.availableRelease).toEqual(nextRelease);
      expect(refreshApp).not.toHaveBeenCalled();

      vi.mocked(fetchRelease).mockResolvedValue(nextRelease);
      vi.mocked(checkForAppUpdate).mockResolvedValue(undefined);
      await act(async () => updates.check());
      expect(updates.status).toBe('available');
    },
  );
});

describe('requested app refresh', () => {
  it('keeps the update available and permits retry when saving or activation fails', async () => {
    await mount();
    await act(async () => receiveRelease(nextRelease));
    vi.mocked(refreshApp).mockRejectedValueOnce(
      new Error('Your current work could not be saved. Save it before refreshing.'),
    );
    await act(async () => updates.refresh());
    expect(updates.refreshing).toBe(false);
    expect(updates.refreshError).toContain('Your current work could not be saved');
    expect(updates.available).toBe(true);
    expect(updates.availableRelease).toEqual(nextRelease);

    let finishRefresh!: () => void;
    vi.mocked(refreshApp).mockReturnValueOnce(new Promise((resolve) => (finishRefresh = resolve)));
    let request!: Promise<void>;
    await act(async () => {
      request = updates.refresh();
    });
    expect(updates.refreshError).toBeNull();
    expect(updates.refreshing).toBe(true);
    await act(async () => updates.refresh());
    expect(refreshApp).toHaveBeenCalledTimes(2);
    await act(async () => {
      finishRefresh();
      await request;
    });
  });
});
