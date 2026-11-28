// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api';
import { TRAIN_ERRORS, TRAIN_INVITE_SECONDS } from './trainTogether';
import {
  captureTrainInvite,
  clearTrainInvite,
  openTrainInvite,
  pendingTrainInvite,
  TRAIN_INVITE_EVENT,
} from './trainTogetherInvite';
import { paletteForTheme, partnerPalettes } from './trainTogetherTheme';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWx';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

afterEach(() => {
  clearTrainInvite();
  vi.restoreAllMocks();
});

describe('train-together invite link capture', () => {
  it('captures #train=<token>, clears the address bar, and drops it after 5 minutes', () => {
    const storage = memoryStorage();
    const history = { state: { idx: 1 }, replaceState: vi.fn() };
    const start = 1_700_000_000_000;

    expect(
      captureTrainInvite(
        { hash: `#train=${TOKEN}`, pathname: '/', search: '' },
        history,
        storage,
        start,
      ),
    ).toBe(TOKEN);
    expect(history.replaceState).toHaveBeenCalledWith({ idx: 1 }, '', '/');
    expect(pendingTrainInvite(storage, start + 60_000)).toBe(TOKEN);

    // Older than 5 minutes is dropped automatically.
    expect(pendingTrainInvite(storage, start + TRAIN_INVITE_SECONDS * 1000 + 1)).toBeNull();
    expect(pendingTrainInvite(storage, start)).toBeNull();
  });

  it('ignores non-train hashes and dispatches TRAIN_INVITE_EVENT on openTrainInvite', () => {
    const storage = memoryStorage();
    const history = { state: null, replaceState: vi.fn() };
    expect(
      captureTrainInvite({ hash: '#social', pathname: '/', search: '' }, history, storage),
    ).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();

    const listener = vi.fn();
    window.addEventListener(TRAIN_INVITE_EVENT, listener);
    try {
      openTrainInvite(TOKEN, storage, 1_000);
    } finally {
      window.removeEventListener(TRAIN_INVITE_EVENT, listener);
    }
    expect(listener).toHaveBeenCalledOnce();
    expect(pendingTrainInvite(storage, 1_500)).toBe(TOKEN);
  });
});

describe('ApiError.member parsing', () => {
  it('exposes error.member for train_not_friends responses and leaves other errors untouched', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: TRAIN_ERRORS.notFriends,
            message: 'Add Jordan as a friend to train together.',
            member: { user_id: 'user-jordan', name: 'Jordan' },
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    let caught: unknown;
    try {
      await api.trainTogether.join(TOKEN);
    } catch (reason) {
      caught = reason;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const err = caught as ApiError;
    expect(err.status).toBe(403);
    expect(err.code).toBe(TRAIN_ERRORS.notFriends);
    expect(err.message).toBe('Add Jordan as a friend to train together.');
    expect(err.member).toEqual({ user_id: 'user-jordan', name: 'Jordan' });

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: TRAIN_ERRORS.inviteExpired,
            message: 'This code has expired. Ask for a new one.',
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    let expiredErr: unknown;
    try {
      await api.trainTogether.join(TOKEN);
    } catch (reason) {
      expiredErr = reason;
    }
    expect(expiredErr).toBeInstanceOf(ApiError);
    expect((expiredErr as ApiError).member).toBeUndefined();
  });
});

describe('partner palette derivation', () => {
  it('skips the viewer theme and derives light/dark tokens', () => {
    const dark = partnerPalettes('blue', 3, false);
    expect(dark.map((p) => p.id)).toEqual(['plum', 'amber', 'coral']);
    expect(dark[0].accent).toBe('#8057ba');
    expect(dark[0].text).toBe('#c4a2ef');

    const light = paletteForTheme('plum', true);
    expect(light.text).toBe('#663f9e');
    expect(light.soft).toContain('0.12');
    expect(light.line).toContain('0.36');

    const onPlum = partnerPalettes('plum', 2, false);
    expect(onPlum.map((p) => p.id)).toEqual(['amber', 'coral']);
  });
});
