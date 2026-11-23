import { act, renderHook } from '@testing-library/react-native';
import { memoryKv } from '../testing/memoryKvStore';
import { captureFriendInvite, useDeferredFriendInvite } from './friendInvite';

let mockPathname = '/sign-in';
const mockRouter = { navigate: jest.fn() };
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRootNavigationState: () => ({ key: 'root' }),
  useRouter: () => mockRouter,
}));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../testing/memoryKvStore'));

const KEY = 'relay.pendingFriendInvite';
const profile = (id: string) => ({
  pathname: '/social/profile/[id]',
  params: { id, invite: '1' },
});

function mount(canOpen: boolean, pathname: string) {
  mockPathname = pathname;
  return renderHook(
    ({ open }: { open: boolean }) => {
      useDeferredFriendInvite(open);
    },
    { initialProps: { open: canOpen } },
  );
}

beforeEach(() => mockRouter.navigate.mockReset());

// First, so the module has not read storage yet: the app was closed between the link and sign-up.
test('an invite kept on the device opens after the next sign-in', async () => {
  memoryKv.set(KEY, JSON.stringify('friend-0'));
  await mount(true, '/');
  expect(mockRouter.navigate).toHaveBeenCalledWith(profile('friend-0'));
  expect(memoryKv.has(KEY)).toBe(false);
});

test('a launch link waits for sign-in, then for the guard to leave Sign in', async () => {
  const view = await mount(false, '/sign-in');
  await act(() => captureFriendInvite('exp://127.0.0.1:18852/--/social/profile/friend-1?invite=1'));
  expect(memoryKv.get(KEY)).toBe(JSON.stringify('friend-1'));

  // Signing in (or creating an account) flips the guard before the stack resets to Home.
  await view.rerender({ open: true });
  expect(mockRouter.navigate).not.toHaveBeenCalled();

  mockPathname = '/';
  await view.rerender({ open: true });
  expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  expect(mockRouter.navigate).toHaveBeenCalledWith(profile('friend-1'));
  expect(memoryKv.has(KEY)).toBe(false);

  mockPathname = '/social/profile/friend-1';
  await view.rerender({ open: true });
  expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
});

test('the invite is opened after a required password change too', async () => {
  const view = await mount(false, '/password-required');
  await act(() => captureFriendInvite('relay-mobile://social/profile/friend-2?invite=1'));
  mockPathname = '/';
  await view.rerender({ open: true });
  expect(mockRouter.navigate).toHaveBeenCalledWith(profile('friend-2'));
});

test('a signed-in app leaves links to the router, and ignores other links', async () => {
  const signedIn = await mount(true, '/');
  await act(() => captureFriendInvite('relay-mobile://social/profile/friend-3?invite=1'));
  expect(memoryKv.has(KEY)).toBe(false);
  await signedIn.unmount();

  const signedOut = await mount(false, '/sign-in');
  await act(() => captureFriendInvite('relay-mobile://social/profile/friend-4?invite=0'));
  await act(() => captureFriendInvite('relay-mobile://settings'));
  mockPathname = '/';
  await signedOut.rerender({ open: true });
  expect(mockRouter.navigate).not.toHaveBeenCalled();
});
