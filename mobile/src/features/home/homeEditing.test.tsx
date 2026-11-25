import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  defaultHomeLayout,
  HOME_SECTIONS,
  type HomeLayout,
} from '../../../../frontend/src/homeLayout';
import type { Exercise, TrainingPreferences, User } from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { showToast } from '../../ui/Toast';
import { AUTO_SCROLL_EDGE, dragAutoScrollStep, type DragScrollMetrics } from './HomeLayoutGrid';
import { HomeLayoutScreen } from './HomeLayoutScreen';
import { MuscleGoalsScreen } from './MuscleGoalsScreen';

interface MockPanConfig {
  enabled?: boolean;
  onActivate?: (event: { x: number; y: number; absoluteY: number }) => void;
  onUpdate?: (event: { translationX: number; translationY: number; absoluteY: number }) => void;
  onDeactivate?: (event: { canceled: boolean }) => void;
  onFinalize?: (event: { canceled: boolean }) => void;
}
const mockPanGestures = new Map<string, MockPanConfig>();

jest.mock('react-native-gesture-handler', () => {
  const { isValidElement } = jest.requireActual<typeof import('react')>('react');
  const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ScrollView,
    GestureDetector: ({
      gesture,
      children,
    }: {
      gesture: MockPanConfig;
      children: ReactElement<{ testID?: string }>;
    }) => {
      if (isValidElement(children) && typeof children.props.testID === 'string') {
        mockPanGestures.set(children.props.testID, gesture);
      }
      return children;
    },
    usePanGesture: (config: MockPanConfig) => config,
  };
});
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: <T,>(initial: T) => {
      const box = {
        value: initial,
        set(next: T) {
          box.value = next;
        },
      };
      return box;
    },
    useAnimatedStyle: (fn: () => object) => fn(),
  };
});

jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
const mockRouter = { back: jest.fn(), push: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePreventRemove: jest.fn(),
  useIsFocused: () => true,
  // Header buttons render in place, so tests can press them.
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => ReactElement } }) =>
      options?.headerRight?.() ?? null,
  },
}));
jest.mock('../../session/SessionProvider', () => ({
  useUser: () => ({ id: 'u1', username: 'preview', display_name: 'Preview' }) as User,
}));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
// The native menu has no test renderer; this stand-in lists its items as buttons.
jest.mock('../../ui/MenuButton', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MenuButton: (props: {
      accessibilityLabel: string;
      items: { label: string; onPress: () => void }[];
      width: number;
      height: number;
    }) =>
      createElement(
        View,
        {
          accessibilityLabel: props.accessibilityLabel,
          testID: `menu-${props.width}x${props.height}`,
        },
        props.items.map((item) =>
          createElement(
            Pressable,
            {
              key: item.label,
              accessibilityRole: 'button',
              accessibilityLabel: `${props.accessibilityLabel}: ${item.label}`,
              onPress: item.onPress,
            },
            createElement(Text, null, item.label),
          ),
        ),
      ),
  };
});

const preferences: TrainingPreferences = {
  preferred_weight_unit: 'kg',
  week_start: 'monday',
  zone2_goal_minutes: 150,
  weekly_muscle_set_goal: 10,
  weekly_muscle_set_goals: { Chest: 12 },
};
const exercises = [
  { id: 'bench', name: 'Bench Press', muscle_group: 'Chest', category: 'strength' },
  { id: 'row', name: 'Barbell Row', muscle_group: 'Lats', category: 'strength' },
] as unknown as Exercise[];
let responses: Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockPanGestures.clear();
  jest.replaceProperty(Platform, 'OS', 'android');
  responses = {
    '/api/home-layout': defaultHomeLayout(),
    '/api/training-preferences': preferences,
    '/api/exercises': exercises,
    '/api/dashboard': {},
    '/api/workouts/snapshot': { revision: '1', workouts: [] },
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    const value = responses[path.split('?')[0]];
    if (value === undefined) throw new Error(`Unexpected ${path}`);
    return value;
  });
  jest
    .mocked(apiSend)
    .mockImplementation(async (_path: string, _method: string, body?: unknown) => body);
});

let client: QueryClient;
afterEach(() => client.clear());

async function show(screenElement: ReactElement) {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{screenElement}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const savedLayout = () => jest.mocked(apiSend).mock.calls.at(-1)?.[2] as HomeLayout;

test('the layout editor moves, hides, adds and resizes cards, then saves the layout', async () => {
  await show(<HomeLayoutScreen />);
  const save = await screen.findByRole('button', { name: 'Save Home layout' });
  expect(save).toBeDisabled();

  await fireEvent.press(screen.getByRole('button', { name: 'Move Recent records up' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Hide Profile' }));
  expect(showToast).toHaveBeenLastCalledWith('Profile hidden');
  await fireEvent.press(screen.getByRole('button', { name: 'Add Body goal' }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'More for Recent records: Compact width' }),
  );
  // Records joins the two cards that are half width already.
  expect(screen.getAllByText('Half width')).toHaveLength(3);
  // The training block card is listed with the rest.
  expect(screen.getByText('Training block')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Save Home layout' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalled());
  const layout = savedLayout();
  expect(jest.mocked(apiSend).mock.calls.at(-1)?.slice(0, 2)).toEqual(['/api/home-layout', 'PUT']);
  expect(layout.order.slice(0, 2)).toEqual(['next-workout', 'body-goal']);
  expect(layout.order.indexOf('records')).toBeLessThan(layout.order.indexOf('combined-check-in'));
  expect(layout.order).toContain('training-block');
  expect(layout.hidden).toContain('profile');
  expect(layout.hidden).not.toContain('body-goal');
  expect(layout.widths).toEqual({ records: 'compact' });
  // Every section's settings go with it, so saving never drops one.
  expect(Object.keys(layout.settings ?? {})).toHaveLength(7);
  expect(showToast).toHaveBeenLastCalledWith('Home layout saved');
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
});

test("each row's More menu gets a 44 pt frame around its 38 pt circle", async () => {
  await show(<HomeLayoutScreen />);
  await screen.findByRole('button', { name: 'Save Home layout' });
  const menus = screen.getAllByLabelText(/^More for [^:]+$/);
  expect(menus.length).toBeGreaterThan(0);
  expect(screen.getAllByTestId('menu-44x44')).toHaveLength(menus.length);
});

test("a card's options change in its Customise sheet", async () => {
  await show(<HomeLayoutScreen />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'More for Workouts: Customise…' }),
  );
  expect(await screen.findByText('Customise Workouts')).toBeVisible();
  await fireEvent.press(screen.getByRole('radio', { name: '4 weeks' }));
  expect(screen.getByRole('radio', { name: '4 weeks' })).toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'More for Body weight check-in: Customise…' }),
  );
  await fireEvent.press(await screen.findByRole('radio', { name: 'Body fat only' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  // The training block card's design, as the web's Customise offers.
  await fireEvent.press(
    screen.getByRole('button', { name: 'More for Training block: Customise…' }),
  );
  await fireEvent.press(await screen.findByRole('radio', { name: 'Timeline' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save Home layout' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalled());
  expect(savedLayout().settings).toMatchObject({
    workouts: { weeks: 4 },
    check_in: { mode: 'fat' },
    cardio_sessions: { weeks: 8 },
    training_block: { style: 'timeline' },
  });
});

test('a failed save keeps the changes and says so', async () => {
  jest.mocked(apiSend).mockRejectedValueOnce(new Error('Could not reach Relay.'));
  await show(<HomeLayoutScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Hide Profile' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save Home layout' }));
  expect(
    await screen.findByText(
      'Could not save your layout. Your changes are still here, so try again.',
    ),
  ).toBeVisible();
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Add Profile' })).toBeVisible();
});

test('Reset to default brings back the default layout to save', async () => {
  responses['/api/home-layout'] = { ...defaultHomeLayout(), hidden: ['records', 'friends'] };
  await show(<HomeLayoutScreen />);
  expect(await screen.findByRole('button', { name: 'Add Recent records' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Reset to default' }));
  expect(screen.queryByRole('button', { name: 'Add Recent records' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save Home layout' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalled());
  expect(savedLayout().hidden).toEqual(defaultHomeLayout().hidden);
});

test('muscle goals save each muscle as its field is left, and return to the default', async () => {
  await show(<MuscleGoalsScreen />);
  expect(await screen.findByText('Default 10 sets a week')).toBeVisible();
  expect(screen.getByText('1 custom')).toBeVisible();
  const lats = screen.getByLabelText('Lats weekly set goal');
  await fireEvent.changeText(lats, '14');
  await fireEvent(lats, 'endEditing');
  await waitFor(() =>
    expect(apiSend).toHaveBeenLastCalledWith('/api/training-preferences', 'PUT', {
      ...preferences,
      weekly_muscle_set_goals: { Chest: 12, Lats: 14 },
    }),
  );
  expect(showToast).toHaveBeenLastCalledWith('Lats goal set to 14 sets');

  await fireEvent.press(screen.getByRole('button', { name: 'Use default goal for Chest' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenLastCalledWith('/api/training-preferences', 'PUT', {
      ...preferences,
      weekly_muscle_set_goals: { Lats: 14 },
    }),
  );
  expect(showToast).toHaveBeenLastCalledWith('Chest uses the default goal');
});

test('a muscle goal out of range is not saved', async () => {
  await show(<MuscleGoalsScreen />);
  const lats = await screen.findByLabelText('Lats weekly set goal');
  await fireEvent.changeText(lats, '0');
  await fireEvent(lats, 'endEditing');
  expect(await screen.findByText('Enter a whole number of sets from 1 to 1,000.')).toBeVisible();
  expect(apiSend).not.toHaveBeenCalled();
});

function layoutBox(
  element: ReturnType<typeof screen.getByTestId>,
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
) {
  return fireEvent(element, 'layout', { nativeEvent: { layout: box } });
}

test('dragging a card into an empty half-row fills the space and saves the layout', async () => {
  responses['/api/home-layout'] = {
    order: ['consistency', 'friends', 'zone2', 'bodyweight-trend'],
    hidden: [],
    widths: { consistency: 'compact', friends: 'full' },
  };
  await show(<HomeLayoutScreen />);
  const dropSpace = (await screen.findByTestId('home-drop-space-consistency')).parent!;
  const consistencySlot = screen.getByTestId('home-layout-card-consistency').parent!;
  const row0 = consistencySlot.parent!;
  const friendsSlot = screen.getByTestId('home-layout-card-friends').parent!;
  const row1 = friendsSlot.parent!;
  const zone2Slot = screen.getByTestId('home-layout-card-zone2').parent!;
  const row2 = zone2Slot.parent!;

  await layoutBox(row0, { x: 0, y: 0, width: 360, height: 100 });
  await layoutBox(consistencySlot, { x: 0, y: 0, width: 175, height: 100 });
  await layoutBox(dropSpace, { x: 185, y: 0, width: 175, height: 100 });
  await layoutBox(row1, { x: 0, y: 110, width: 360, height: 60 });
  await layoutBox(friendsSlot, { x: 0, y: 0, width: 360, height: 60 });
  await layoutBox(row2, { x: 0, y: 180, width: 360, height: 100 });
  await layoutBox(zone2Slot, { x: 0, y: 0, width: 175, height: 100 });

  const pan = mockPanGestures.get('home-layout-card-zone2')!;
  await act(async () => {
    pan.onActivate?.({ x: 80, y: 50, absoluteY: 300 });
    // Moves from (80, 230) to (260, 50), landing inside the empty space after Consistency.
    pan.onUpdate?.({ translationX: 180, translationY: -180, absoluteY: 120 });
    pan.onDeactivate?.({ canceled: false });
  });

  expect(screen.queryByTestId('home-drop-space-consistency')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save Home layout' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalled());
  expect(savedLayout()).toMatchObject({
    order: ['consistency', 'zone2', 'friends', 'bodyweight-trend'],
    widths: { consistency: 'compact', friends: 'full', zone2: 'compact' },
  });
});

test('dragging onto another card reorders without losing cards, and cancelling keeps the draft', async () => {
  responses['/api/home-layout'] = {
    ...defaultHomeLayout(),
    widths: { consistency: 'compact', friends: 'full' },
  };
  await show(<HomeLayoutScreen />);
  const consistencySlot = (await screen.findByTestId('home-layout-card-consistency')).parent!;
  const row0 = consistencySlot.parent!;
  const friendsSlot = screen.getByTestId('home-layout-card-friends').parent!;
  const row1 = friendsSlot.parent!;

  await layoutBox(row0, { x: 0, y: 0, width: 360, height: 100 });
  await layoutBox(consistencySlot, { x: 0, y: 0, width: 175, height: 100 });
  await layoutBox(row1, { x: 0, y: 110, width: 360, height: 60 });
  await layoutBox(friendsSlot, { x: 0, y: 0, width: 360, height: 60 });

  // Cancel a drag over Consistency: Save stays disabled.
  const friendsPan = mockPanGestures.get('home-layout-card-friends')!;
  await act(async () => {
    friendsPan.onActivate?.({ x: 50, y: 30, absoluteY: 200 });
    friendsPan.onUpdate?.({ translationX: 0, translationY: -110, absoluteY: 90 });
    friendsPan.onDeactivate?.({ canceled: true });
  });
  expect(screen.getByRole('button', { name: 'Save Home layout' })).toBeDisabled();

  // Complete the drag onto Consistency.
  const latestPan = mockPanGestures.get('home-layout-card-friends')!;
  await act(async () => {
    latestPan.onActivate?.({ x: 50, y: 30, absoluteY: 200 });
    latestPan.onUpdate?.({ translationX: 0, translationY: -110, absoluteY: 90 });
    latestPan.onDeactivate?.({ canceled: false });
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Save Home layout' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalled());
  const saved = savedLayout();
  expect(saved.order).toHaveLength(HOME_SECTIONS.length);
  expect(new Set(saved.order).size).toBe(HOME_SECTIONS.length);
  expect(saved.order.indexOf('friends')).toBeLessThan(saved.order.indexOf('consistency'));
});

test('tapping an empty space adds a hidden section into that slot', async () => {
  responses['/api/home-layout'] = {
    order: ['workouts', 'cardio-sessions', 'friends', 'consistency'],
    hidden: ['friends'],
    widths: { workouts: 'compact', 'cardio-sessions': 'compact' },
  };
  await show(<HomeLayoutScreen />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Add a section after Cardio sessions' }),
  );
  expect(await screen.findByText('Add a section here')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Add Recent Friends Activity here' }));
  expect(screen.queryByTestId('home-drop-space-cardio-sessions')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save Home layout' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalled());
  expect(savedLayout()).toMatchObject({
    order: ['workouts', 'cardio-sessions', 'friends', 'consistency'],
    hidden: [],
    widths: { workouts: 'compact', 'cardio-sessions': 'compact', friends: 'third' },
  });
});

test('the empty-space sheet lists sections without repeating its title, and says when none are left', async () => {
  responses['/api/home-layout'] = {
    order: ['workouts', 'cardio-sessions', 'friends', 'consistency'],
    hidden: ['friends'],
    widths: { workouts: 'compact', 'cardio-sessions': 'compact' },
  };
  await show(<HomeLayoutScreen />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Add a section after Cardio sessions' }),
  );
  expect(await screen.findByText('Add a section here')).toBeVisible();
  expect(screen.queryByText('Choose a section to add to this space.')).toBeNull();
  expect(screen.queryByText('All available sections are already on Home.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Add Recent Friends Activity here' }));
  expect(screen.queryByText('Add a section here')).toBeNull();
});

test('compact cards give their move buttons a 44 pt touch frame around a 32 pt circle', async () => {
  responses['/api/home-layout'] = {
    order: ['workouts', 'cardio-sessions', 'consistency'],
    hidden: [],
    widths: { workouts: 'compact', 'cardio-sessions': 'compact', consistency: 'compact' },
  };
  await show(<HomeLayoutScreen />);
  for (const label of ['Move Workouts down', 'Move Cardio sessions up', 'Move Consistency up']) {
    const button = await screen.findByRole('button', { name: label });
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ width: 44, height: 44 });
  }
});

describe('drag auto-scroll', () => {
  // A viewport 100 pt down the window and 650 pt tall, part-way through 2,000 pt of content.
  const metrics: DragScrollMetrics = {
    y: 300,
    height: 650,
    top: 100,
    contentHeight: 2000,
    bottomInset: 0,
    insetExtendsScroll: false,
  };

  test('measures the edges from the viewport in window coordinates', () => {
    // A stationary finger 600 pt down the window is well inside the viewport: no scrolling.
    expect(dragAutoScrollStep(metrics, 600)).toBeNull();
    expect(dragAutoScrollStep(metrics, 100 + AUTO_SCROLL_EDGE + 1)).toBeNull();
    expect(dragAutoScrollStep(metrics, 750 - AUTO_SCROLL_EDGE - 1)).toBeNull();
    // Near the bottom edge (window Y 750) it scrolls down; near the top (100) it scrolls up.
    expect(dragAutoScrollStep(metrics, 700)).toBe(310);
    expect(dragAutoScrollStep(metrics, 150)).toBe(290);
    // Held still, the same finger keeps stepping from wherever the content has got to.
    expect(dragAutoScrollStep({ ...metrics, y: 310 }, 700)).toBe(320);
  });

  test('keeps clear of the part of the viewport under the home indicator', () => {
    const covered = { ...metrics, bottomInset: 34 };
    expect(dragAutoScrollStep(covered, 750 - 34 - AUTO_SCROLL_EDGE - 1)).toBeNull();
    expect(dragAutoScrollStep(covered, 750 - 34 - AUTO_SCROLL_EDGE + 1)).toBe(310);
  });

  test('stops at the ends of the content, including an iOS-adjusted bottom inset', () => {
    expect(dragAutoScrollStep({ ...metrics, y: 0 }, 150)).toBeNull();
    expect(dragAutoScrollStep({ ...metrics, y: 1350 }, 700)).toBeNull();
    expect(dragAutoScrollStep({ ...metrics, y: 1345 }, 700)).toBe(1350);
    const ios = { ...metrics, y: 1350, bottomInset: 34, insetExtendsScroll: true };
    expect(dragAutoScrollStep(ios, 700)).toBe(1360);
    expect(dragAutoScrollStep({ ...ios, y: 1384 }, 700)).toBeNull();
    expect(dragAutoScrollStep({ ...metrics, height: 0 }, 700)).toBeNull();
  });
});
