import { router, Stack, Tabs } from 'expo-router';
import { act, renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';
import * as trainingLayout from '../../app/(tabs)/training/_layout';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));

function ScreenLabel({ text }: { text: string }) {
  return <Text>{text}</Text>;
}

function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="training" />
    </Tabs>
  );
}

test('pushing Machine weights from outside Training anchors index underneath so Back lands on Training', async () => {
  const result = await renderRouter(
    {
      _layout: RootLayout,
      settings: () => <ScreenLabel text="Settings" />,
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': () => <ScreenLabel text="Home" />,
      '(tabs)/training/_layout': trainingLayout,
      '(tabs)/training/index': () => <ScreenLabel text="Training root" />,
      '(tabs)/training/exercise/[id]': () => <ScreenLabel text="Exercise" />,
      '(tabs)/training/session/[id]': () => <ScreenLabel text="Session" />,
      '(tabs)/training/exercise-edit/[id]': () => <ScreenLabel text="Edit exercise" />,
      '(tabs)/training/exercise-merge': () => <ScreenLabel text="Merge exercises" />,
      '(tabs)/training/machine-weights/[id]': () => <ScreenLabel text="Machine weights" />,
    },
    { initialUrl: '/settings' },
  );

  expect(result.getPathname()).toBe('/settings');

  await act(async () => {
    router.push(
      { pathname: '/training/machine-weights/[id]', params: { id: 'leg-press' } },
      { withAnchor: true },
    );
  });

  expect(result.getPathname()).toBe('/training/machine-weights/leg-press');
  const findRoute = (
    navState: ReturnType<typeof result.getRouterState>,
    name: string,
  ): NonNullable<typeof navState>['routes'][number] | undefined => {
    if (!navState) return undefined;
    const active = navState.routes[navState.index ?? navState.routes.length - 1];
    if (active?.name === name) return active;
    return findRoute(active?.state as typeof navState, name);
  };
  const trainingRoute = findRoute(result.getRouterState(), 'training');
  expect(trainingRoute?.state?.routes.map((route) => route.name)).toEqual([
    'index',
    'machine-weights/[id]',
  ]);

  await act(async () => {
    router.back();
  });

  expect(result.getPathname()).toBe('/training');
  await result.unmount();
});
