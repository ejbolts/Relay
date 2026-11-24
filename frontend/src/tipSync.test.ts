import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interruptedNudge, NUDGE_MIN_VISIBLE_MS, type ShownNudge } from './tipScheduling';
import {
  createTipSync,
  mergeServerTips,
  mergeTipStates,
  sameTips,
  TIP_SYNC_DEBOUNCE_MS,
  TIP_SYNC_REFRESH_MS,
  tipSyncHoldUntil,
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
  let send: ReturnType<typeof vi.fn<(state: TipState) => Promise<unknown>>>;
  const make = () =>
    createTipSync({
      read: () => local,
      write: (state) => {
        writes.push(state);
        local = state;
      },
      send,
      current: () => current,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    local = freshTips();
    server = {};
    writes = [];
    current = true;
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
});
