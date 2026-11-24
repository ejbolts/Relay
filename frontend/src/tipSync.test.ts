import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interruptedNudge, NUDGE_MIN_VISIBLE_MS, type ShownNudge } from './tipScheduling';
import {
  createTipSync,
  mergeServerTips,
  mergeTipStates,
  sameTips,
  TIP_SYNC_DEBOUNCE_MS,
  TIP_SYNC_REFRESH_MS,
  INITIAL_TIP_GENERATION,
  TIP_SYNC_REFUSED,
  TipSyncBusy,
  tipsAfterReply,
  tipSyncHoldUntil,
  tipSyncPath,
} from './tipSync';
import cases from './tipSyncCases.json';
import { freshTips, parseTips, tipShown, withTipsEnabled, type TipState } from './tipsState';

describe('mergeTipStates', () => {
  it.each(cases.cases.map((item) => [item.name, item] as const))('%s', (_name, item) => {
    expect(mergeTipStates(item.stored, item.incoming)).toEqual(item.expected);
  });

  it('gives the same tips whichever copy is stored', () => {
    // Only the order of Home's lists may differ.
    const tips = (value: unknown) => {
      const state = parseTips(JSON.stringify(value));
      return {
        ...state,
        homeRead: state.homeRead && [...state.homeRead].sort(),
        homeDone: state.homeDone && [...state.homeDone].sort(),
      };
    };
    for (const { stored, incoming } of cases.cases) {
      const forward = tips(mergeTipStates(stored, incoming));
      const backward = tips(mergeTipStates(incoming, stored));
      expect(sameTips(forward, backward)).toBe(true);
    }
  });

  it('merging a copy with itself changes nothing', () => {
    const state = withTipsEnabled(
      tipShown({ ...freshTips(), seen: { plates: 'learned' }, homeRead: ['swap'] }, 'swap', 50),
      false,
      60,
    );
    expect(sameTips(parseTips(JSON.stringify(mergeTipStates(state, state))), state)).toBe(true);
  });
});

describe('mergeServerTips', () => {
  it('keeps ids this client does not know off the device', () => {
    const merged = mergeServerTips(
      freshTips(),
      { seen: { futureTip: 'dismissed', swap: 'learned' } },
      0,
    );
    expect(merged.seen).toEqual({ swap: 'learned' });
  });

  it('brings back a reminder the merge makes due', () => {
    const day = 24 * 60 * 60 * 1000;
    const merged = mergeServerTips(
      freshTips(),
      {
        seen: { normalise: 'dismissed' },
        reminders: { normalise: { count: 0, at: 7 * day } },
      },
      8 * day,
    );
    expect(merged.seen.normalise).toBeUndefined();
    expect(merged.reminders?.normalise?.count).toBe(1);
  });

  it('keeps the Show tips time', () => {
    expect(mergeServerTips(freshTips(), { enabled: false, enabledAt: 70 }, 0)).toMatchObject({
      enabled: false,
      enabledAt: 70,
    });
  });
});

describe('createTipSync', () => {
  let local: TipState;
  let server: Record<string, unknown>;
  let writes: TipState[];
  let current: boolean;
  let send: ReturnType<typeof vi.fn<(state: TipState, generation?: string) => Promise<unknown>>>;
  let sharedHold = 0;
  const make = () =>
    createTipSync({
      read: () => local,
      write: (state) => {
        writes.push(state);
        local = state;
      },
      send,
      current: () => current,
      sharedHold: () => sharedHold,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    local = freshTips();
    server = {};
    writes = [];
    current = true;
    sharedHold = 0;
    send = vi.fn(async (state: TipState) => {
      server = mergeTipStates(server, state);
      return server;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves a local change after a pause, once', async () => {
    const sync = make();
    local = { ...local, seen: { swap: 'dismissed' } };
    sync.changed();
    sync.changed();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS - 1);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(server.seen).toEqual({ swap: 'dismissed' });
    // The reply held nothing new, so this device's tips were left alone.
    expect(writes).toEqual([]);
  });

  it('merges the account’s tips into this device on sign-in', async () => {
    server = { seen: { plates: 'learned' }, lastShown: 900_000, enabled: false, enabledAt: 5 };
    local = { ...local, seen: { swap: 'dismissed' } };
    make().syncNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(local.seen).toEqual({ plates: 'learned', swap: 'dismissed' });
    expect(local).toMatchObject({ lastShown: 900_000, enabled: false, enabledAt: 5 });
    expect(server.seen).toEqual({ plates: 'learned', swap: 'dismissed' });
  });

  it('merges a reply into changes made while it was on its way', async () => {
    let release: (value: unknown) => void = () => {};
    send.mockImplementationOnce(
      (state) =>
        new Promise((resolve) => {
          server = mergeTipStates(server, state);
          release = resolve;
        }),
    );
    server = { seen: { plates: 'learned' } };
    const sync = make();
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    local = { ...local, seen: { swap: 'dismissed' } };
    sync.changed();
    release(server);
    await vi.advanceTimersByTimeAsync(0);
    expect(local.seen).toEqual({ swap: 'dismissed', plates: 'learned' });
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(server.seen).toEqual({ plates: 'learned', swap: 'dismissed' });
  });

  it('drops a late reply once the account has changed, and stops sending', async () => {
    server = { seen: { plates: 'learned' } };
    const sync = make();
    sync.syncNow();
    current = false;
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toEqual([]);
    sync.stop();
    sync.changed();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps this device’s tips when offline, and tries again on the next return', async () => {
    send.mockRejectedValueOnce(new Error('offline'));
    const sync = make();
    local = { ...local, seen: { swap: 'dismissed' } };
    sync.changed();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS);
    expect(local.seen).toEqual({ swap: 'dismissed' });
    sync.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(server.seen).toEqual({ swap: 'dismissed' });
  });

  it('fetches on return at most every so often when nothing changed', async () => {
    const sync = make();
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    sync.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(TIP_SYNC_REFRESH_MS);
    sync.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('stops for the session when the server has no tip store', async () => {
    send.mockResolvedValueOnce(null);
    const sync = make();
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    sync.changed();
    sync.refresh();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never lets a sync undo an interrupted nudge’s rollback', async () => {
    const sync = make();
    const now = Date.now();
    const request = { page: 'log', until: now + 60_000 };
    const before = local;
    local = tipShown(local, 'reorder', now);
    const shown: ShownNudge = {
      id: 'reorder',
      at: now,
      previousLastShown: before.lastShown,
      request,
      shownCount: 1,
      seenAfter: undefined,
    };
    sync.hold(tipSyncHoldUntil(now));
    sync.changed();
    // Returning to the app while the nudge shows asks for a sync too.
    sync.refresh();
    await vi.advanceTimersByTimeAsync(NUDGE_MIN_VISIBLE_MS - 1);
    expect(send).not.toHaveBeenCalled();
    local = interruptedNudge(local, shown, Date.now())!.state;
    sync.changed();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(server.shows).toEqual({});
    expect(server.lastShown).toBe(0);
    expect(local.shows?.reorder).toBeUndefined();
  });

  it('restarts the pause on every change', async () => {
    const sync = make();
    sync.changed();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS - 100);
    local = { ...local, seen: { swap: 'dismissed' } };
    sync.changed();
    await vi.advanceTimersByTimeAsync(100);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS - 100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(server.seen).toEqual({ swap: 'dismissed' });
  });

  it('a sync asked for now isn’t put off by a change', async () => {
    const sync = make();
    sync.syncNow();
    sync.changed();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('waits for another tab’s nudge hold, and saves what that tab settled on', async () => {
    const sync = make();
    const now = Date.now();
    // Another tab showed a nudge: its hold and its showing are in the shared tips.
    sharedHold = tipSyncHoldUntil(now);
    local = tipShown(local, 'reorder', now);
    sync.refresh();
    await vi.advanceTimersByTimeAsync(NUDGE_MIN_VISIBLE_MS);
    expect(send).not.toHaveBeenCalled();
    // That tab put the nudge back after an early interruption.
    local = freshTips();
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(server.shows).toEqual({});
    expect(server.lastShown).toBe(0);
  });

  it('merges a reply into what another tab saved meanwhile', async () => {
    let release: (value: unknown) => void = () => {};
    send.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const sync = make();
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    // Another tab switched tips off while the reply was on its way.
    local = withTipsEnabled(local, false, Date.now());
    release({ enabled: true, enabledAt: 5, seen: { plates: 'learned' }, generation: '0' });
    await vi.advanceTimersByTimeAsync(0);
    expect(local).toMatchObject({ enabled: false, seen: { plates: 'learned' } });
  });

  it('sends the generation it last synced, and adopts the tips of a restore', async () => {
    server = { seen: { plates: 'learned' } };
    send.mockImplementation(async (state, generation) => {
      if (generation !== undefined && generation !== 'restored')
        return { ...server, generation: 'restored' };
      server = mergeTipStates(server, state);
      return { ...server, generation: 'restored' };
    });
    local = { ...local, syncGeneration: 'before', seen: { swap: 'dismissed' }, enabled: false };
    const sync = make();
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ syncGeneration: 'before' }),
      'before',
    );
    // The older copy was replaced, not merged back in.
    expect(local).toMatchObject({
      seen: { plates: 'learned' },
      enabled: true,
      syncGeneration: 'restored',
    });
    expect(server.seen).toEqual({ plates: 'learned' });
    // From then on it syncs as usual.
    local = { ...local, seen: { ...local.seen, back: 'seen' } };
    sync.changed();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS);
    expect(send).toHaveBeenLastCalledWith(expect.anything(), 'restored');
    expect(server.seen).toEqual({ plates: 'learned', back: 'seen' });
  });

  it('sends the initial generation when it has none recorded', async () => {
    make().syncNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenLastCalledWith(expect.anything(), INITIAL_TIP_GENERATION);
  });

  it('drops a reply from before another tab adopted a restore, and syncs again from it', async () => {
    let release: (value: unknown) => void = () => {};
    send.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    local = { ...local, syncGeneration: 'g1' };
    const sync = make();
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    // Another tab adopted restore g2 while this reply (from g1) was on its way.
    local = { ...freshTips(), seen: { plates: 'learned' }, syncGeneration: 'g2' };
    send.mockImplementation(async () => ({ seen: { plates: 'learned' }, generation: 'g2' }));
    release({ seen: { swap: 'dismissed' }, generation: 'g1' });
    await vi.advanceTimersByTimeAsync(0);
    expect(local).toMatchObject({ seen: { plates: 'learned' }, syncGeneration: 'g2' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(expect.anything(), 'g2');
  });

  it('keeps changes here while refused for another account, until a sync asked for now is accepted', async () => {
    send.mockResolvedValueOnce(TIP_SYNC_REFUSED);
    const sync = make();
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    local = { ...local, seen: { swap: 'dismissed' } };
    sync.changed();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS * 2);
    expect(send).toHaveBeenCalledTimes(1);
    // The account signed in again: returning to the tab is accepted, and syncing resumes.
    sync.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(server.seen).toEqual({ swap: 'dismissed' });
    local = { ...local, seen: { ...local.seen, back: 'seen' } };
    sync.changed();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('retries a busy server a few times, then waits for the next change or return', async () => {
    send.mockRejectedValue(new TipSyncBusy());
    const sync = make();
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(send).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(4);
    send.mockImplementation(async (state) => (server = mergeTipStates(server, state)));
    sync.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('runs a sync asked for during a refused request once its reply is in', async () => {
    let refuse: (value: unknown) => void = () => {};
    send.mockImplementationOnce(() => new Promise((resolve) => (refuse = resolve)));
    const sync = make();
    local = { ...local, seen: { swap: 'dismissed' } };
    sync.changed();
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS);
    expect(send).toHaveBeenCalledTimes(1);
    // The account signs in again elsewhere and this tab comes back, while the old request is out.
    sync.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(1);
    refuse(TIP_SYNC_REFUSED);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(server.seen).toEqual({ swap: 'dismissed' });
  });

  it('cancels a save a change was waiting for when its request is refused', async () => {
    let refuse: (value: unknown) => void = () => {};
    send.mockImplementationOnce(() => new Promise((resolve) => (refuse = resolve)));
    const sync = make();
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    // A change while the request is out, then the refusal.
    local = { ...local, seen: { swap: 'dismissed' } };
    sync.changed();
    await vi.advanceTimersByTimeAsync(1000);
    refuse(TIP_SYNC_REFUSED);
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS * 3);
    expect(send).toHaveBeenCalledTimes(1);
    expect(local.seen).toEqual({ swap: 'dismissed' });
  });

  it('saves a change made during an accepted request once the pause after it ends', async () => {
    let release: (value: unknown) => void = () => {};
    send.mockImplementationOnce(
      (state) =>
        new Promise((resolve) => {
          server = mergeTipStates(server, state);
          release = resolve;
        }),
    );
    const sync = make();
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    local = { ...local, seen: { swap: 'dismissed' } };
    sync.changed();
    release(server);
    await vi.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS - 1);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(server.seen).toEqual({ swap: 'dismissed' });
  });
});

describe('tipsAfterReply', () => {
  const reply = { seen: { plates: 'learned' }, generation: 'g2' };
  const local = (syncGeneration?: string) => ({
    ...freshTips(),
    seen: { swap: 'dismissed' as const },
    ...(syncGeneration === undefined ? {} : { syncGeneration }),
  });
  it('merges and records the generation on a first sync of an unrestored account', () => {
    expect(tipsAfterReply(local(), { ...reply, generation: '0' }, '0', 0)).toMatchObject({
      seen: { swap: 'dismissed', plates: 'learned' },
      syncGeneration: '0',
    });
  });
  it('replaces a copy with no recorded generation once the account has been restored', () => {
    expect(tipsAfterReply(local(), reply, INITIAL_TIP_GENERATION, 0)).toMatchObject({
      seen: { plates: 'learned' },
      syncGeneration: 'g2',
    });
  });
  it('replaces a copy from before a restore, on any device that reconnects', () => {
    const next = tipsAfterReply(local('g1'), reply, 'g1', 0)!;
    expect(next.seen).toEqual({ plates: 'learned' });
    expect(next.syncGeneration).toBe('g2');
  });
  it('merges when another tab has already adopted the restore', () => {
    expect(tipsAfterReply(local('g2'), reply, 'g1', 0)!.seen).toEqual({
      swap: 'dismissed',
      plates: 'learned',
    });
  });
  it('discards a reply from before a restore that another tab has since adopted', () => {
    expect(tipsAfterReply(local('g2'), { ...reply, generation: 'g1' }, 'g1', 0)).toBeNull();
  });
  it('discards a reply from an earlier restore once another tab adopted a later one', () => {
    expect(tipsAfterReply(local('g3'), reply, 'g1', 0)).toBeNull();
  });
});

describe('tipSyncPath', () => {
  it('names the account and the generation', () => {
    expect(tipSyncPath('u 1', undefined)).toBe('/api/tips?account=u+1');
    expect(tipSyncPath('u1', 'g2')).toBe('/api/tips?account=u1&generation=g2');
  });
});

it('keeps __proto__ as an ordinary tip id and event', () => {
  const merged = mergeTipStates(
    JSON.parse('{"counts":{"__proto__":2},"seen":{"__proto__":"dismissed"}}'),
    JSON.parse('{"counts":{"__proto__":3}}'),
  );
  expect(Object.hasOwn(merged.counts as object, '__proto__')).toBe(true);
  expect(JSON.parse(JSON.stringify(merged))).toEqual(
    JSON.parse(
      '{"enabled":true,"lastShown":0,"seen":{"__proto__":"dismissed"},"counts":{"__proto__":3},"shows":{}}',
    ),
  );
});
