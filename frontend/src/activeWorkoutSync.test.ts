import { describe, expect, it, vi } from 'vitest';
import {
  ActiveWorkoutSynchronizer,
  draftSignature,
  type SharedWorkoutSnapshot,
} from './activeWorkoutSync';
import type { ActiveWorkoutDraft } from './workoutDraft';

function draft(notes = ''): ActiveWorkoutDraft {
  return {
    version: 1,
    clientSessionId: '37be7007-c0dc-4df2-932f-eb40d4a5ecbc',
    startedAt: 1000,
    updatedAt: 2000,
    lastActiveAt: 2000,
    name: 'Upper',
    workoutDate: '2026-11-15',
    category: 'upper',
    notes,
    movements: [],
  };
}

function harness(local: ActiveWorkoutDraft | null, base: SharedWorkoutSnapshot | null = null) {
  const box = { local, server: base ?? { revision: 0, draft: null }, queued: false };
  const deps = {
    local: () => box.local,
    read: vi.fn(async () => structuredClone(box.server)),
    put: vi.fn(
      async (
        change: SharedWorkoutSnapshot & { base: ActiveWorkoutDraft | null; replace?: boolean },
      ) => {
        box.server = { revision: box.server.revision + 1, draft: change.draft };
        return { ...structuredClone(box.server), conflict: false };
      },
    ),
    apply: vi.fn((value: ActiveWorkoutDraft | null) => {
      box.local = structuredClone(value);
      return true;
    }),
    saveBase: vi.fn(),
    queued: () => box.queued,
    changed: vi.fn(),
  };
  return { sync: new ActiveWorkoutSynchronizer(deps, base), box, deps };
}

describe('shared active workout synchronization', () => {
  it('loads an existing workout on a device without a local draft', async () => {
    const { sync, box, deps } = harness(null);
    box.server = { revision: 4, draft: draft('Desktop sets') };
    await sync.sync();
    expect(box.local?.notes).toBe('Desktop sets');
    expect(deps.put).not.toHaveBeenCalled();
    expect(sync.status).toBe('synced');
  });

  it('uploads a local workout without replacing an unrelated remote workout', async () => {
    const { sync, box, deps } = harness(draft('Local'));
    box.server = {
      revision: 4,
      draft: { ...draft('Remote'), clientSessionId: crypto.randomUUID() },
    };
    await sync.sync();
    expect(sync.status).toBe('conflict');
    expect(box.local?.notes).toBe('Local');
    expect(deps.put).not.toHaveBeenCalled();
  });

  it('sends offline edits with their durable base instead of the latest remote snapshot', async () => {
    const base = { revision: 1, draft: draft() };
    const { sync, deps } = harness(draft('Offline edits'), base);
    await sync.sync();
    expect(deps.put).toHaveBeenCalledWith({
      revision: 1,
      base: base.draft,
      draft: draft('Offline edits'),
    });
  });

  it('keeps keystrokes entered during a request and merges them against exactly what was sent', async () => {
    const { sync, box, deps } = harness(draft('first'), { revision: 1, draft: draft() });
    let finish!: (value: SharedWorkoutSnapshot & { conflict: boolean }) => void;
    deps.put.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = sync.sync();
    box.local = draft('second');
    finish({ revision: 2, draft: { ...draft('first'), name: 'Remote name' }, conflict: false });
    await running;
    expect(deps.put.mock.calls[1][0]).toMatchObject({
      base: draft('first'),
      draft: draft('second'),
    });
    expect(box.local?.notes).toBe('second');
  });

  it('does not apply a remote read over edits entered during that read', async () => {
    const base = { revision: 1, draft: draft() };
    const { sync, box, deps } = harness(draft(), base);
    let finish!: (value: SharedWorkoutSnapshot) => void;
    deps.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = sync.sync();
    box.local = draft('Typing');
    finish({ revision: 2, draft: draft('Remote') });
    await running;
    expect(deps.put.mock.calls[0][0].draft?.notes).toBe('Typing');
  });

  it('clears an unchanged draft ended on another device', async () => {
    const { sync, box } = harness(draft(), { revision: 1, draft: draft() });
    box.server = { revision: 2, draft: null };
    await sync.sync();
    expect(box.local).toBeNull();
  });

  it('retains both versions on conflict and requires an explicit choice', async () => {
    const { sync, box, deps } = harness(draft('Local'), { revision: 1, draft: draft() });
    deps.put.mockResolvedValueOnce({ revision: 2, draft: draft('Remote'), conflict: true });
    box.server = { revision: 2, draft: draft('Remote') };
    await sync.sync();
    expect(box.local?.notes).toBe('Local');
    expect(sync.status).toBe('conflict');
    await sync.resolve(false);
    expect(box.local?.notes).toBe('Remote');
    expect(sync.status).toBe('synced');
  });

  it('resolves keeping this device against the revision shown in the comparison', async () => {
    const { sync, box, deps } = harness(draft('Local'), { revision: 1, draft: draft() });
    const remote = { revision: 2, draft: draft('Remote'), conflict: true };
    box.server = remote;
    deps.put.mockResolvedValueOnce(remote);
    await sync.sync();
    await sync.resolve(true);
    expect(deps.put.mock.calls[1][0]).toMatchObject({
      revision: 2,
      base: remote.draft,
      draft: draft('Local'),
      replace: true,
    });
  });

  it('keeps queued completions from being restored or discarded while saving', async () => {
    const { sync, box, deps } = harness(null, { revision: 1, draft: draft() });
    box.queued = true;
    await sync.sync();
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.put).not.toHaveBeenCalled();
  });

  it('stops late responses from writing into a signed-out or different account', async () => {
    const { sync, box, deps } = harness(null);
    let finish!: (value: SharedWorkoutSnapshot) => void;
    deps.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = sync.sync();
    sync.stop();
    finish({ revision: 1, draft: draft('Previous account') });
    await running;
    expect(box.local).toBeNull();
    expect(deps.saveBase).not.toHaveBeenCalled();
  });

  it('forces review when a finish check discovers remote edits', async () => {
    const { sync, box } = harness(draft(), { revision: 1, draft: draft() });
    box.server = { revision: 2, draft: draft('Remote changes') };
    await expect(sync.finishFields()).rejects.toThrow('Review the latest sets');
    expect(await sync.finishFields()).toEqual({
      active_workout_revision: 2,
      active_workout_session_id: draft().clientSessionId,
    });
  });

  it('allows offline finishing with its last known revision and preserves the draft', async () => {
    const { sync, box, deps } = harness(draft('Offline'), { revision: 1, draft: draft() });
    deps.put.mockRejectedValue(new TypeError('Network unavailable'));
    expect(await sync.finishFields()).toMatchObject({ active_workout_revision: 1 });
    expect(box.local?.notes).toBe('Offline');
  });

  it('ignores object order and persistence timestamps, but tracks real activity', () => {
    expect(draftSignature(draft())).toBe(draftSignature({ ...draft(), updatedAt: 9999 }));
    expect(draftSignature(draft())).not.toBe(draftSignature({ ...draft(), lastActiveAt: 9999 }));
  });
});
