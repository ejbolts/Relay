import { describe, expect, it, vi } from 'vitest';
import {
  ActiveWorkoutSynchronizer,
  type SharedWorkoutSnapshot,
  type SyncDependencies,
} from './activeWorkoutSynchronizer';
import type { ActiveWorkoutDraft } from './workoutDraft';

const draft = (clientSessionId: string, notes = ''): ActiveWorkoutDraft => ({
  version: 1,
  clientSessionId,
  startedAt: 1000,
  updatedAt: 2000,
  lastActiveAt: 2000,
  name: 'Upper',
  workoutDate: '2026-11-15',
  category: 'upper',
  notes,
  movements: [],
});

function harness(overrides: Partial<SyncDependencies>, local: ActiveWorkoutDraft | null) {
  const box = { local, server: { revision: 0, draft: null } as SharedWorkoutSnapshot };
  const deps: SyncDependencies = {
    local: () => box.local,
    read: vi.fn(async () => structuredClone(box.server)),
    put: vi.fn(async (change) => {
      box.server = { revision: box.server.revision + 1, draft: change.draft };
      return { ...structuredClone(box.server), conflict: false };
    }),
    apply: (value) => {
      box.local = structuredClone(value);
      return true;
    },
    saveBase: vi.fn(),
    queued: () => false,
    changed: vi.fn(),
    connectionFailure: () => true,
    newId: () => '5a5b2b6a-1111-4c8a-9b1e-2f2f2f2f2f2f',
    ...overrides,
  };
  return { sync: new ActiveWorkoutSynchronizer(deps), box, deps };
}

describe('the shared synchronizer', () => {
  it("keeps this device's ended workout as a new session made by the platform", async () => {
    const mine = draft('37be7007-c0dc-4df2-932f-eb40d4a5ecbc', 'Phone');
    const { sync, box } = harness({}, mine);
    box.server = { revision: 2, draft: draft('9c1d0a54-2a3b-4c5d-8e9f-0a1b2c3d4e5f', 'Web') };
    await sync.sync();
    expect(sync.status).toBe('conflict');
    await sync.resolve(true);
    expect(box.server.draft?.clientSessionId).toBe('5a5b2b6a-1111-4c8a-9b1e-2f2f2f2f2f2f');
    expect(box.server.draft?.notes).toBe('Phone');
  });

  it('finishes offline only when the server could not be reached and surfaces refusal reasons', async () => {
    const failing = vi.fn(async () => {
      throw new Error('Set 1: average heart rate (1,132 bpm) must be at most 250 bpm.');
    });
    const offline = harness(
      { read: failing, put: failing },
      draft('37be7007-c0dc-4df2-932f-eb40d4a5ecbc'),
    );
    await expect(offline.sync.finishFields()).resolves.toEqual({});
    const refused = harness(
      { read: failing, put: failing, connectionFailure: () => false },
      draft('37be7007-c0dc-4df2-932f-eb40d4a5ecbc'),
    );
    await expect(refused.sync.finishFields()).rejects.toThrow(
      'Could not sync the workout: Set 1: average heart rate (1,132 bpm) must be at most 250 bpm.',
    );
    const silentRefusal = harness(
      {
        read: vi.fn(async () => {
          throw new Error('');
        }),
        put: failing,
        connectionFailure: () => false,
      },
      draft('37be7007-c0dc-4df2-932f-eb40d4a5ecbc'),
    );
    await expect(silentRefusal.sync.finishFields()).rejects.toThrow(
      'Could not sync the workout. Try again before finishing.',
    );
  });
});
