// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  activeAgo,
  byLiveActivity,
  liveWorkoutReport,
  onFriendPresence,
  presenceStatus,
  presenceText,
  usePresenceConnection,
  workoutElapsed,
} from './presence';
import type { FriendPresence } from './types';
import {
  clearActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from './workoutDraft';

const NOW = Date.parse('2026-10-25T10:00:00Z');
const MINUTE = 60_000;

class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(code: number) {
    this.closedWith = code;
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function draft(overrides: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  return {
    version: 1,
    startedAt: NOW - 20 * MINUTE,
    updatedAt: NOW,
    inactiveFinishAt: NOW + 31 * MINUTE,
    name: '',
    workoutDate: '2026-10-25',
    category: 'push',
    notes: '',
    movements: [],
    ...overrides,
  };
}

function Connection({ userId }: { userId: string | null }) {
  usePresenceConnection(userId);
  return null;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearActiveWorkoutDraft();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('describes elapsed time, last activity and status, and orders friends by live activity', () => {
  expect(workoutElapsed(new Date(NOW - 30_000).toISOString(), NOW)).toBe('under a minute');
  expect(workoutElapsed(new Date(NOW - 38 * MINUTE).toISOString(), NOW)).toBe('38 min');
  expect(workoutElapsed(new Date(NOW - 65 * MINUTE).toISOString(), NOW)).toBe('1 h 05');
  expect(activeAgo(new Date(NOW - 20_000).toISOString(), NOW)).toBe('Active just now');
  expect(activeAgo(new Date(NOW - 5 * MINUTE).toISOString(), NOW)).toBe('Active 5m ago');
  expect(activeAgo(new Date(NOW - 130 * MINUTE).toISOString(), NOW)).toBe('Active 2h ago');
  expect(activeAgo(new Date(NOW - 30 * 60 * MINUTE).toISOString(), NOW)).toBe('Active yesterday');
  expect(activeAgo(new Date(NOW - 80 * 60 * MINUTE).toISOString(), NOW)).toBe('Active 3d ago');

  const workout = {
    name: 'Push day',
    kind: 'strength' as const,
    started_at: '2026-10-25T09:40:00Z',
  };
  const working: FriendPresence = { online: false, last_active_at: null, workout };
  const online: FriendPresence = { online: true, last_active_at: null, workout: null };
  const away: FriendPresence = {
    online: false,
    last_active_at: '2026-10-25T08:00:00Z',
    workout: null,
  };
  expect(presenceText(presenceStatus(working), NOW)).toBe('Working out');
  expect(presenceText(presenceStatus(online), NOW)).toBe('Active now');
  expect(presenceText(presenceStatus(away), NOW)).toBe('Active 2h ago');
  expect(presenceStatus({ online: null, last_active_at: null, workout: null })).toBeNull();
  expect(presenceStatus(undefined)).toBeNull();

  const later = { ...working, workout: { ...workout, started_at: '2026-10-25T09:55:00Z' } };
  const friends = [
    { id: 'away', presence: away },
    { id: 'hidden', presence: null },
    { id: 'online', presence: online },
    { id: 'working', presence: working },
    { id: 'later', presence: later },
  ];
  expect(byLiveActivity(friends, (friend) => friend.presence).map((friend) => friend.id)).toEqual([
    'later',
    'working',
    'online',
    'away',
    'hidden',
  ]);
});

it('reports this device’s workout with a fallback name until it would auto-finish', () => {
  expect(liveWorkoutReport()).toBeNull();
  writeActiveWorkoutDraft(draft());
  expect(liveWorkoutReport()).toEqual({
    name: 'Push workout',
    kind: 'strength',
    started_at: '2026-10-25T09:40:00.000Z',
    // Rounded up to the next five minutes after the auto-finish time.
    expires_at: '2026-10-25T10:35:00.000Z',
  });
  writeActiveWorkoutDraft(draft({ name: '  Easy 5k  ', category: 'cardio' }));
  expect(liveWorkoutReport()).toMatchObject({ name: 'Easy 5k', kind: 'cardio' });
  expect(liveWorkoutReport(NOW + 32 * MINUTE)).toBeNull();
});

it('reports visibility and workout changes, relays friends’ presence and reconnects', async () => {
  const received: Array<[string, FriendPresence | null]> = [];
  const stop = onFriendPresence((friendId, presence) => received.push([friendId, presence]));
  await act(async () => root.render(<Connection userId="me" />));
  const [socket] = FakeSocket.instances;
  expect(socket.url).toBe(`ws://${window.location.host}/api/presence/ws`);

  await act(async () => socket.open());
  expect(socket.sent).toEqual([
    { type: 'state', device: expect.any(String), visible: true, workout: null },
  ]);
  const device = socket.sent[0].device;
  expect(localStorage.getItem('relay.presence-device')).toBe(device);

  // Starting a workout here reports it straight away; unchanged saves are not resent.
  writeActiveWorkoutDraft(draft({ name: 'Push day' }));
  writeActiveWorkoutDraft(draft({ name: 'Push day', updatedAt: NOW + 1_000 }));
  expect(socket.sent).toHaveLength(2);
  expect(socket.sent[1]).toMatchObject({ device, workout: { name: 'Push day', kind: 'strength' } });
  clearActiveWorkoutDraft();
  expect(socket.sent[2]).toMatchObject({ workout: null });

  const presence = { online: true, last_active_at: null, workout: null };
  await act(async () => {
    socket.onmessage?.({ data: JSON.stringify({ type: 'presence', user_id: 'alex', presence }) });
    socket.onmessage?.({ data: 'not json' });
    socket.onmessage?.({ data: JSON.stringify({ type: 'other', user_id: 'alex' }) });
  });
  expect(received).toEqual([['alex', presence]]);

  // The heartbeat resends the visible state; a dropped socket retries after a delay.
  await act(async () => vi.advanceTimersByTime(25_000));
  expect(socket.sent).toHaveLength(4);
  await act(async () => socket.drop());
  expect(FakeSocket.instances).toHaveLength(1);
  await act(async () => vi.advanceTimersByTime(1_000));
  expect(FakeSocket.instances).toHaveLength(2);

  // Signing out on the server stops retries; unmounting closes the socket.
  const retry = FakeSocket.instances[1];
  await act(async () => retry.open());
  await act(async () => retry.drop(4401));
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(FakeSocket.instances).toHaveLength(2);
  stop();
});

it('connects only while signed in and closes on sign-out', async () => {
  await act(async () => root.render(<Connection userId={null} />));
  expect(FakeSocket.instances).toHaveLength(0);
  await act(async () => root.render(<Connection userId="me" />));
  const [socket] = FakeSocket.instances;
  await act(async () => socket.open());
  await act(async () => root.render(<Connection userId={null} />));
  expect(socket.closedWith).toBe(1000);
  await act(async () => socket.drop(1000));
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(FakeSocket.instances).toHaveLength(1);
});
