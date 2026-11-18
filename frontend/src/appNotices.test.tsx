// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import {
  APP_NOTICES_WAIT_MS,
  releaseAtLeast,
  useAppNotices,
  type AppNoticesState,
} from './appNotices';
import { launchPromptAllowed } from './launchPrompts';

vi.mock('./api', () => ({ api: { getAppNotices: vi.fn(), saveAppNotices: vi.fn() } }));

let root: Root;
let container: HTMLDivElement;
let state: AppNoticesState;

function Harness({ userId }: { userId: string | null }) {
  state = useAppNotices(userId);
  return null;
}
async function render(userId: string | null) {
  await act(async () => root.render(<Harness userId={userId} />));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api.saveAppNotices).mockResolvedValue({ release_seen: null, weekly_review_seen: null });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('releaseAtLeast', () => {
  it.each([
    ['1.3.0', '1.3.0', true],
    ['1.10.0', '1.9.4', true],
    ['2.0.0', '1.12.7', true],
    ['1.2.9', '1.3.0', false],
    ['1.3.0', '1.3.1', false],
    [null, '1.0.0', false],
  ])('%s seen covers %s: %s', (seen, version, expected) => {
    expect(releaseAtLeast(seen, version)).toBe(expected);
  });
});

describe('one prompt per app open', () => {
  it('lets the first prompt open and keeps the others for a later visit', () => {
    expect(launchPromptAllowed(null, 'release')).toBe(true);
    expect(launchPromptAllowed('release', 'release')).toBe(true);
    expect(launchPromptAllowed('release', 'weekly-review')).toBe(false);
    expect(launchPromptAllowed('onboarding', 'home-guide')).toBe(false);
  });
});

describe('useAppNotices', () => {
  it('waits for the account, then reports what it has seen', async () => {
    let answer!: (value: { release_seen: string; weekly_review_seen: null }) => void;
    vi.mocked(api.getAppNotices).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    await render('alice');
    expect(state.ready).toBe(false);
    await act(async () => answer({ release_seen: '1.3.0', weekly_review_seen: null }));
    expect(state).toMatchObject({
      ready: true,
      notices: { release_seen: '1.3.0', weekly_review_seen: null },
    });
  });

  it('carries on with this device alone when the request fails or takes too long', async () => {
    vi.mocked(api.getAppNotices).mockRejectedValue(new Error('offline'));
    await render('alice');
    expect(state).toMatchObject({ ready: true, notices: null });

    vi.useFakeTimers();
    vi.mocked(api.getAppNotices).mockReturnValue(new Promise(() => undefined));
    await render('bob');
    expect(state.ready).toBe(false);
    await act(async () => vi.advanceTimersByTime(APP_NOTICES_WAIT_MS));
    expect(state).toMatchObject({ ready: true, notices: null });
  });

  it('records a notice for the account at once and tells the server', async () => {
    vi.mocked(api.getAppNotices).mockResolvedValue({
      release_seen: '1.2.0',
      weekly_review_seen: null,
    });
    await render('alice');
    await act(async () => state.record({ weekly_review_seen: '2026-11-16' }));
    expect(state.notices).toEqual({ release_seen: '1.2.0', weekly_review_seen: '2026-11-16' });
    expect(api.saveAppNotices).toHaveBeenCalledWith({ weekly_review_seen: '2026-11-16' });
  });

  it('needs no request when nobody is signed in', async () => {
    await render(null);
    expect(state).toMatchObject({ ready: true, notices: null });
    expect(api.getAppNotices).not.toHaveBeenCalled();
    state.record({ release_seen: '1.3.0' });
    expect(api.saveAppNotices).not.toHaveBeenCalled();
  });
});
