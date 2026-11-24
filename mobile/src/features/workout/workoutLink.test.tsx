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

type State = { canOpen: boolean; live: boolean; signedOut: boolean };
const LOADING: State = { canOpen: false, live: false, signedOut: false };

function mount(state: State, pathname: string) {
  mockPathname = pathname;
  return renderHook((props: State) => useDeferredWorkoutLink(props), { initialProps: state });
}

beforeEach(() => {
  mockRouter.navigate.mockReset();
  resetWorkoutLinkForTests();
});
afterEach(() => jest.useRealTimers());

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
  await view.rerender({ canOpen: true, live: false, signedOut: false });
  expect(mockRouter.navigate).not.toHaveBeenCalled();
  // On Home, with the restored workout still loading.
  mockPathname = '/';
  await view.rerender({ canOpen: true, live: false, signedOut: false });
  expect(mockRouter.navigate).not.toHaveBeenCalled();

  await view.rerender({ canOpen: true, live: true, signedOut: false });
  expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  expect(mockRouter.navigate).toHaveBeenCalledWith('/workout');

  // Opened once: the link is spent.
  mockPathname = '/workout';
  await view.rerender({ canOpen: true, live: true, signedOut: false });
  mockPathname = '/';
  await view.rerender({ canOpen: true, live: true, signedOut: false });
  expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
});

test('with no workout to restore, the link is dropped after a while', async () => {
  jest.useFakeTimers();
  const view = await mount(LOADING, '/sign-in');
  await act(() => captureWorkoutLink('relay-mobile://workout'));
  mockPathname = '/';
  await view.rerender({ canOpen: true, live: false, signedOut: false });
  await act(async () => jest.advanceTimersByTime(WORKOUT_LINK_WAIT_MS));
  // A workout started later doesn't jump to the logger.
  await view.rerender({ canOpen: true, live: true, signedOut: false });
  expect(mockRouter.navigate).not.toHaveBeenCalled();
});

test('a session that turns out signed out drops the link', async () => {
  const view = await mount(LOADING, '/sign-in');
  await act(() => captureWorkoutLink('relay-mobile://workout'));
  await view.rerender({ canOpen: false, live: false, signedOut: true });
  // The next account to sign in doesn't land in the logger.
  mockPathname = '/';
  await view.rerender({ canOpen: true, live: true, signedOut: false });
  expect(mockRouter.navigate).not.toHaveBeenCalled();
});

test('while Relay can open the logger itself, a link is left to the router', async () => {
  mockPathname = '/';
  const view = await mount({ canOpen: true, live: true, signedOut: false }, '/');
  await act(() => captureWorkoutLink('relay-mobile://workout'));
  await view.rerender({ canOpen: true, live: true, signedOut: false });
  expect(mockRouter.navigate).not.toHaveBeenCalled();
});
