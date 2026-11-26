import { router, Stack } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import * as adminLayout from '../app/admin/_layout';
import * as blocksLayout from '../app/blocks/_layout';
import * as dataLayout from '../app/data/_layout';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../testing/memoryKvStore'));
jest.mock('./SessionProvider', () => ({
  useUser: () => ({ id: 'admin', username: 'preview', is_admin: true }),
}));

function label(text: string) {
  return function Label() {
    return <Text>{text}</Text>;
  };
}

function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="settings" />
      <Stack.Screen name="blocks" options={{ headerShown: false }} />
      <Stack.Screen name="data" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
    </Stack>
  );
}

const routes = {
  _layout: RootLayout,
  settings: label('Settings'),
  'blocks/_layout': blocksLayout,
  'blocks/index': label('Blocks'),
  'blocks/edit': label('Block form'),
  'blocks/summary/[id]': label('Block summary'),
  'data/_layout': dataLayout,
  'data/import': label('Import'),
  'data/import-review': label('Import review'),
  'data/import-mapping': label('Import mapping'),
  'data/import-history': label('Import history'),
  'data/export': label('Export'),
  'admin/_layout': adminLayout,
  'admin/index': label('Admin'),
  'admin/account/[id]': label('Account'),
  'admin/server': label('Server'),
  'admin/username/[id]': label('Change username'),
};

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };
/** Headers with a custom left item: the first screen's back button out of the stack. */
function backButtons() {
  let count = 0;
  const walk = (node: Node | Node[] | string | null) => {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === 'RNSScreenStackHeaderSubview' && node.props.type === 'left') count += 1;
    node.children?.forEach(walk);
  };
  walk(screen.toJSON() as Node | Node[] | null);
  return count;
}
const stateWarnings = () =>
  warn.mock.calls.filter(([message]) =>
    String(message).includes('getState() was called during render'),
  );

test.each([
  ['/blocks', '/blocks/edit'],
  ['/data/import', '/data/export'],
  ['/admin', '/admin/server'],
  ['/blocks/summary/b1', '/blocks/edit'],
])(
  'the first screen of %s gets a back button out; a screen pushed over it keeps the native one',
  async (first, next) => {
    const result = await renderRouter(routes, { initialUrl: '/settings' });
    await act(async () => router.push(first as never));
    expect(result.getPathname()).toBe(first);
    // Only the first screen's header has the back button out of the stack.
    expect(backButtons()).toBe(1);

    await act(async () => router.push(next as never));
    expect(result.getPathname()).toBe(next);
    // The pushed screen uses the stack's own back, so the first screen's stays the only one.
    expect(backButtons()).toBe(1);
    expect(stateWarnings()).toEqual([]);
    await result.unmount();
  },
);

test('a stack opened straight from a link has nothing beneath it, so no back button out', async () => {
  // The app's root has no anchor under a linked stack: the summary is the only screen, so
  // HeaderBack (which needs somewhere to go back to) shows nothing, as before. No warning either.
  const result = await renderRouter(routes, { initialUrl: '/blocks/summary/b1' });
  expect(result.getPathname()).toBe('/blocks/summary/b1');
  expect(screen.getByText('Block summary')).toBeTruthy();
  expect(backButtons()).toBe(0);
  expect(stateWarnings()).toEqual([]);
  await result.unmount();
});
