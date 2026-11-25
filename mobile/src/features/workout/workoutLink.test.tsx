import { act, renderHook } from '@testing-library/react-native';
import {
  captureWorkoutLink,
  isWorkoutLink,
  resetWorkoutLinkForTests,
  useDeferredWorkoutLink,
  WORKOUT_LINK_WAIT_MS,
} from './workoutLink';

let mockPathname = '/sign-in';
const mockRouter = { navigate: jest.fn() };
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRootNavigationState: () => ({ key: 'root' }),
  useRouter: () => mockRouter,
}));
// The opener component's imports; the hook itself needs neither.
jest.mock('../../session/SessionProvider', () => ({ useOptionalSession: () => null }));
jest.mock('./WorkoutProvider', () => ({ useWorkout: () => ({ live: null }) }));

type State = Parameters<typeof useDeferredWorkoutLink>[0];
const LOADING: State = { loading: true, userId: null, canOpen: false, live: false };
const SIGNED_OUT: State = { loading: false, userId: null, canOpen: false, live: false };
const signedIn = (userId: string, live = false): State => ({
  loading: false,
  userId,
  canOpen: true,
  live,
});

let now = new Date(2026, 10, 24, 9, 0).getTime();

function mount(state: State, pathname: string) {
  mockPathname = pathname;
  return renderHook((props: State) => useDeferredWorkoutLink(props), { initialProps: state });
}

beforeEach(() => {
  mockRouter.navigate.mockReset();
  resetWorkoutLinkForTests();
  now = new Date(2026, 10, 24, 9, 0).getTime();
  jest.useFakeTimers({ doNotFake: ['Date'] });
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function wait(ms: number) {
  now += ms;
  await act(async () => jest.advanceTimersByTime(ms));
}

test('recognises the activity link in the app and in Expo Go', () => {
  for (const url of [
    'relay-mobile://workout',
    'relay-mobile:///workout',
    'exp://127.0.0.1:18892/--/workout',
    '/workout',
    '/workout?from=activity',
  ])
    expect(isWorkoutLink(url)).toBe(true);
  for (const url of ['/workouts', '/edit-workout/1', 'relay-mobile://start-workout', '/'])
    expect(isWorkoutLink(url)).toBe(false);
});

test('a cold-start link waits for sign-in and the restored workout, then opens the logger', async () => {
  const view = await mount(LOADING, '/sign-in');
  await act(() => captureWorkoutLink('relay-mobile://workout'));

  // Signed in, but the guard is still leaving Sign in for Home.
  await view.rerender(signedIn('u1'));
  expect(mockRouter.navigate).not.toHaveBeenCalled();
  // On Home, with the restored workout still loading.
  mockPathname = '/';
  await view.rerender(signedIn('u1'));
  await wait(3_000);
  expect(mockRouter.navigate).not.toHaveBeenCalled();

  await view.rerender(signedIn('u1', true));
  expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  expect(mockRouter.navigate).toHaveBeenCalledWith('/workout');

  // Opened once: the link is spent.
  mockPathname = '/workout';
  await view.rerender(signedIn('u1', true));
  mockPathname = '/';
  await view.rerender(signedIn('u1', true));
  expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
});

test('the wait runs from the link’s arrival, however often the screen changes', async () => {
  const view = await mount(LOADING, '/sign-in');
  await act(() => captureWorkoutLink('relay-mobile://workout'));
  mockPathname = '/';
  await view.rerender(signedIn('u1'));
  // Moving between screens every few seconds doesn't restart the wait.
  for (const pathname of ['/training', '/', '/body', '/']) {
    await wait(4_000);
    mockPathname = pathname;
    await view.rerender(signedIn('u1'));
  }
  // 16 s after the link arrived, the workout goes live: too late to jump to it.
  expect(Date.now() - new Date(2026, 10, 24, 9, 0).getTime()).toBeGreaterThan(WORKOUT_LINK_WAIT_MS);
  await view.rerender(signedIn('u1', true));
  expect(mockRouter.navigate).not.toHaveBeenCalled();
});

test('a slow session check eats into the wait too', async () => {
  const view = await mount(LOADING, '/sign-in');
  await act(() => captureWorkoutLink('relay-mobile://workout'));
  await wait(WORKOUT_LINK_WAIT_MS + 1_000);
  mockPathname = '/';
  await view.rerender(signedIn('u1', true));
  expect(mockRouter.navigate).not.toHaveBeenCalled();
});

test('a link that arrives once Sign in is showing is not kept for the next sign-in', async () => {
  const view = await mount(LOADING, '/sign-in');
  await view.rerender(SIGNED_OUT);
  await act(() => captureWorkoutLink('relay-mobile://workout'));
  mockPathname = '/';
  await view.rerender(signedIn('u2', true));
  expect(mockRouter.navigate).not.toHaveBeenCalled();
});

test('a session that turns out signed out drops the link', async () => {
  const view = await mount(LOADING, '/sign-in');
  await act(() => captureWorkoutLink('relay-mobile://workout'));
  await view.rerender(SIGNED_OUT);
  // The next account to sign in doesn't land in the logger.
  mockPathname = '/';
  await view.rerender(signedIn('u2', true));
  expect(mockRouter.navigate).not.toHaveBeenCalled();
});

test('the link belongs to the account the session opened; switching account drops it', async () => {
  const view = await mount(LOADING, '/sign-in');
  await act(() => captureWorkoutLink('relay-mobile://workout'));
  mockPathname = '/';
  await view.rerender(signedIn('u1'));
  await view.rerender(signedIn('u2', true));
  await view.rerender(signedIn('u1', true));
  expect(mockRouter.navigate).not.toHaveBeenCalled();
});

test('while Relay can open the logger itself, a link is left to the router', async () => {
  const view = await mount(signedIn('u1', true), '/');
  await act(() => captureWorkoutLink('relay-mobile://workout'));
  await view.rerender(signedIn('u1', true));
  expect(mockRouter.navigate).not.toHaveBeenCalled();
});
