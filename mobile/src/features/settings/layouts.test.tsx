import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { User } from '../../../../frontend/src/types';
import AdminLayout from '../../app/admin/_layout';
import BlocksLayout from '../../app/blocks/_layout';
import DataLayout from '../../app/data/_layout';
import { unstable_settings as trainingSettings } from '../../app/(tabs)/training/_layout';

type HeaderLeft = (props: { canGoBack?: boolean }) => ReactNode;
const captured: { screenOptions?: unknown } = {};
const mockRouter = { back: jest.fn() };

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useRouter: () => mockRouter,
  useCanGoBack: () => true,
  Stack: Object.assign(
    ({ screenOptions, children }: { screenOptions?: unknown; children?: ReactNode }) => {
      captured.screenOptions = screenOptions;
      return children ?? null;
    },
    { Screen: () => null },
  ),
}));

const adminUser = { id: 'u1', is_admin: true } as User;
jest.mock('../../session/SessionProvider', () => ({ useUser: () => adminUser }));

beforeEach(() => {
  captured.screenOptions = undefined;
  jest.clearAllMocks();
});

test('Training stack anchors index under routes pushed from outside the tab', () => {
  expect(trainingSettings).toEqual({ anchor: 'index' });
});

test.each([
  ['BlocksLayout', BlocksLayout],
  ['DataLayout', DataLayout],
  ['AdminLayout', AdminLayout],
])(
  '%s provides HeaderBack on the first screen without calling navigation.getState()',
  async (_name, Layout) => {
    await render(<Layout />);
    expect(typeof captured.screenOptions).toBe('object');
    const headerLeft = (captured.screenOptions as { headerLeft?: HeaderLeft }).headerLeft;
    expect(typeof headerLeft).toBe('function');

    // First screen in the stack (canGoBack false) gets the custom back button out.
    const first = headerLeft!({ canGoBack: false });
    expect(first).toBeTruthy();
    await render(<>{first}</>);
    expect(screen.getByRole('button', { name: 'Back' })).toBeVisible();

    // Pushed screens in the stack (canGoBack true) keep the native back button.
    expect(headerLeft!({ canGoBack: true })).toBeUndefined();
  },
);
