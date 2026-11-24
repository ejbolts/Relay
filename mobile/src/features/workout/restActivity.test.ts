import {
  relayLiveActivity,
  type RelayLiveActivityNative,
} from '../../../modules/relay-live-activity';
import {
  resetRestActivityForTests,
  restActivityContent,
  syncRestActivity,
  type RestActivityContent,
} from './restActivity';
import { adjustRest, NO_REST, pauseRest, resumeRest, startRest, type RestState } from './restTimer';

jest.mock('../../../modules/relay-live-activity', () => ({ relayLiveActivity: jest.fn() }));

const now = new Date(2026, 10, 23, 9, 0).getTime();
const native = {
  isSupported: jest.fn(() => true),
  show: jest.fn(async () => undefined),
  end: jest.fn(async () => undefined),
} satisfies RelayLiveActivityNative;

const set = (completed: boolean, weight_kg: number | null = 80, reps: number | null = 8) => ({
  key: `s${Math.random()}`,
  completed,
  weight_kg,
  reps,
  set_kind: 'working',
});
const logger = {
  clientSessionId: 'session-1',
  movements: [
    {
      key: 'm1',
      exercise: { name: 'Bench Press', kind: 'strength' },
      sets: [set(true), set(false)],
    },
    { key: 'm2', exercise: { name: 'Squat', kind: 'strength' }, sets: [set(false, null, null)] },
  ],
} as unknown as Parameters<typeof restActivityContent>[1];

const content = (rest: RestState, at = now) => restActivityContent(rest, logger, 'kg', at);
const shown = () => native.show.mock.calls.map((call) => call as unknown[]);

beforeEach(() => {
  jest.clearAllMocks();
  resetRestActivityForTests();
  jest.mocked(relayLiveActivity).mockReturnValue(native);
});

test('the activity names the exercise, the next set and when the rest ends', () => {
  expect(content(startRest(90, 'm1', now, 'r1'))).toEqual({
    sessionId: 'session-1',
    exercise: 'Bench Press',
    nextSet: 'Set 2 · 80 kg × 8',
    endsAt: now + 90_000,
    totalSeconds: 90,
    pausedSeconds: null,
  });
  // The next set in another exercise names it.
  const lastBench = {
    ...logger,
    movements: [{ ...logger.movements[0], sets: [set(true), set(true)] }, logger.movements[1]],
  } as typeof logger;
  expect(restActivityContent(startRest(60, 'm1', now, 'r1'), lastBench, 'kg', now)?.nextSet).toBe(
    'Squat · Set 1',
  );
  expect(content(NO_REST)).toBeNull();
  // A finished rest shows its prompt in the app; the activity ends.
  expect(content({ timer: null, done: { endedAt: now, movementKey: 'm1' } })).toBeNull();
});

test('start, pause, resume and ±30 s each update the activity; skipping ends it', async () => {
  const started = startRest(90, 'm1', now, 'r1');
  await syncRestActivity(content(started));
  expect(shown()).toEqual([
    ['session-1', 'Bench Press', 'Set 2 · 80 kg × 8', now + 90_000, 90, null],
  ]);

  // Paused 20 s in: 70 s left, and a countdown that would end 70 s from the pause.
  const paused = pauseRest(started, now + 20_000);
  await syncRestActivity(content(paused, now + 20_000));
  expect(shown().at(-1)).toEqual([
    'session-1',
    'Bench Press',
    'Set 2 · 80 kg × 8',
    now + 90_000,
    90,
    70,
  ]);
  // Still paused a minute later: nothing has changed, so nothing is sent.
  await syncRestActivity(content(paused, now + 80_000));
  expect(native.show).toHaveBeenCalledTimes(2);

  const resumed = resumeRest(paused, now + 80_000);
  await syncRestActivity(content(resumed, now + 80_000));
  expect(shown().at(-1)?.slice(3)).toEqual([now + 150_000, 90, null]);

  const longer = adjustRest(resumed, 30, now + 80_000);
  await syncRestActivity(content(longer, now + 80_000));
  expect(shown().at(-1)?.slice(3)).toEqual([now + 180_000, 100, null]);

  await syncRestActivity(content(NO_REST));
  expect(native.end).toHaveBeenCalledTimes(1);
  expect(native.show).toHaveBeenCalledTimes(4);
});

test('a burst of changes settles on the latest, in order', async () => {
  void syncRestActivity(content(startRest(90, 'm1', now, 'r1')));
  void syncRestActivity(null);
  await syncRestActivity(content(startRest(120, 'm2', now, 'r2')));
  expect(shown()).toEqual([['session-1', 'Squat', 'Set 1', now + 120_000, 120, null]]);
  expect(native.end).not.toHaveBeenCalled();
});

test('at launch, with no rest, an activity left from before is ended', async () => {
  await syncRestActivity(null);
  expect(native.end).toHaveBeenCalledTimes(1);
  await syncRestActivity(null);
  expect(native.end).toHaveBeenCalledTimes(1);
});

test('a refused activity leaves the rest alone and is tried again at the next change', async () => {
  native.show.mockRejectedValueOnce(new Error('Live Activities are off'));
  const started = content(startRest(90, 'm1', now, 'r1')) as RestActivityContent;
  await expect(syncRestActivity(started)).resolves.toBeUndefined();
  await syncRestActivity(started);
  expect(native.show).toHaveBeenCalledTimes(2);
});

test('without the native module (Expo Go, Android) nothing is called', async () => {
  jest.mocked(relayLiveActivity).mockReturnValue(null);
  await syncRestActivity(content(startRest(90, 'm1', now, 'r1')));
  await syncRestActivity(null);
  expect(native.show).not.toHaveBeenCalled();
  expect(native.end).not.toHaveBeenCalled();
});
