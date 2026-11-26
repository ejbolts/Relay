import {
  adjustRest,
  NO_REST,
  pauseRest,
  restFromStored,
  restSecondsLeft,
  restToStored,
  resumeRest,
  settleRest,
  startRest,
} from './restTimer';

const now = 1_000_000;

test('a rest counts down, adjusts by 30 seconds and finishes into the prompt', () => {
  let rest = startRest(90, 'm1', now, 'r1');
  expect(restSecondsLeft(rest.timer!, now + 10_000)).toBe(80);
  rest = adjustRest(rest, 30, now + 10_000);
  expect(restSecondsLeft(rest.timer!, now + 10_000)).toBe(110);
  expect(rest.timer!.totalSeconds).toBe(110);
  expect(adjustRest(rest, -200, now + 10_000)).toBe(NO_REST);
  expect(settleRest(rest, now + 60_000)).toBe(rest);
  expect(settleRest(rest, now + 120_000)).toEqual({
    timer: null,
    done: { endedAt: now + 120_000, movementKey: 'm1' },
  });
});

test('pausing the workout freezes the rest until it resumes', () => {
  let rest = pauseRest(startRest(60, null, now, 'r1'), now + 20_000);
  expect(rest.timer!.pausedLeft).toBe(40);
  expect(settleRest(rest, now + 600_000)).toBe(rest);
  rest = resumeRest(rest, now + 300_000);
  expect(rest.timer).toMatchObject({ pausedLeft: null, endsAt: now + 340_000 });
});

test('a rest survives the app closing, and one that ended meanwhile shows as done', () => {
  const rest = startRest(60, 'm1', now, 'r1');
  const stored = JSON.parse(JSON.stringify(restToStored(rest, 'session')));
  expect(restFromStored(stored, 'session', now + 30_000)).toEqual(rest);
  expect(restFromStored(stored, 'session', now + 90_000)).toEqual({
    timer: null,
    done: { endedAt: now + 60_000, movementKey: 'm1' },
  });
  expect(restFromStored(stored, 'another session', now)).toEqual(NO_REST);
  expect(restToStored(NO_REST, 'session')).toBeNull();
});
