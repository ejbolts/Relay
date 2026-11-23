import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { defaultHomeLayout, type HomeLayout } from '../../../../frontend/src/homeLayout';
import type { Exercise, TrainingPreferences, User } from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { showToast } from '../../ui/Toast';
import { HomeLayoutScreen } from './HomeLayoutScreen';
import { MuscleGoalsScreen } from './MuscleGoalsScreen';

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
    }) =>
      createElement(
        View,
        { accessibilityLabel: props.accessibilityLabel },
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
