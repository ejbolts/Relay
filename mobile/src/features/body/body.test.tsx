import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { prettyDate } from '../../../../frontend/src/appShared';
import type { BodySizeLog } from '../../../../frontend/src/bodySizes';
import { emptyBodySizeLog } from '../../../../frontend/src/bodySizeEntries';
import { addDays, dayMonth } from '../../../../frontend/src/trainingSummary';
import type {
  BodyMeasurement,
  BodyWeightGoal,
  TrainingPreferences,
  User,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { apiGet, apiSend } from '../../data/api';
import { ToastHost } from '../../ui/Toast';
import { BodyScreen } from './BodyScreen';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
const mockUser = { id: 'u1', username: 'preview', display_name: 'Preview', sex: null } as User;
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockUser }));
// A plain text box for the native date picker, so a test can type a date.
jest.mock('./DateField', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    DateField: (props: { label: string; value: string; onChange: (date: string) => void }) =>
      createElement(TextInput, {
        accessibilityLabel: props.label,
        value: props.value,
        onChangeText: props.onChange,
      }),
  };
});
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
            { key: item.label, accessibilityRole: 'button', onPress: item.onPress },
            createElement(Text, null, item.label),
          ),
        ),
      ),
  };
});
jest.mock('@react-native-segmented-control/segmented-control', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return function SegmentedControl(props: {
    values: string[];
    selectedIndex: number;
    accessibilityLabel: string;
    onChange: (event: { nativeEvent: { selectedSegmentIndex: number } }) => void;
  }) {
    return createElement(
      View,
      { accessibilityLabel: props.accessibilityLabel },
      props.values.map((value, index) =>
        createElement(
          Pressable,
          {
            key: value,
            accessibilityRole: 'tab',
            accessibilityState: { selected: index === props.selectedIndex },
            onPress: () => props.onChange({ nativeEvent: { selectedSegmentIndex: index } }),
          },
          createElement(Text, null, value),
        ),
      ),
    );
  };
});

const today = localDate();
const checkIn = (
  id: string,
  days: number,
  weight_kg: number,
  body_fat_pct: number | null = null,
  notes: string | null = null,
): BodyMeasurement => ({
  id,
  measurement_date: addDays(today, -days),
  weight_kg,
  body_fat_pct,
  notes,
  is_sample: false,
  created_at: '',
});
const measurements = [
  checkIn('m1', 0, 84.2),
  checkIn('m2', 2, 84.6, 18.5, 'After travel'),
  checkIn('m3', 10, 85.4),
];
const goal: BodyWeightGoal = {
  id: 'g1',
  start_date: addDays(today, -30),
  target_date: addDays(today, 60),
  start_weight_kg: 86,
  target_weight_kg: 80,
  active: true,
  created_at: '',
};
const preferences = { preferred_weight_unit: 'kg', week_start: 'monday' } as TrainingPreferences;

let responses: Record<string, unknown>;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  responses = {
    '/api/body-measurements': measurements,
    '/api/body-weight-goals': [goal],
    '/api/body-sizes': [] as BodySizeLog[],
    '/api/training-preferences': preferences,
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    const value = responses[path.split('?')[0]];
    if (value === undefined) throw new Error(`Unexpected ${path}`);
    return value;
  });
  jest.mocked(apiSend).mockImplementation(async (path: string, method: string, body?: unknown) => {
    if (method === 'DELETE') return undefined;
    if (path === '/api/body-measurements')
      return { ...checkIn('saved', 0, 0), ...(body as object) };
    if (path === '/api/body-weight-goals') return { ...(body as object), id: 'g2', created_at: '' };
    if (path === '/api/profile') return { ...mockUser, ...(body as object) };
    return body;
  });
});

let client: QueryClient;
afterEach(() => {
  client.clear();
  jest.useRealTimers();
});

async function renderBody() {
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
      <QueryClientProvider client={client}>
        <BodyScreen />
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await screen.findByLabelText('Bodyweight: 84.2 kg');
}

test('Body shows the latest weight, goal and body fat, the trend and the history', async () => {
  await renderBody();
  expect(screen.getByText(`3 check-ins · latest ${dayMonth(today)}`)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Edit goal, 80 kg' })).toBeVisible();
  expect(
    screen.getByLabelText(`Body fat: 18.5%, ${dayMonth(measurements[1].measurement_date)}`),
  ).toBeVisible();
  expect(screen.getByLabelText('Trend')).toBeVisible();
  expect(screen.getByText('7-day average')).toBeVisible();
  expect(screen.getByText('Goal 80 kg')).toBeVisible();
  expect(
    screen.getByLabelText(
      'Weight decreased by 0.4 kg since previous check-in; in line with weight-loss goal',
    ),
  ).toBeVisible();
  expect(screen.getByText('After travel')).toBeVisible();

  // The weekly view averages each week's check-ins.
  await fireEvent.press(screen.getByRole('tab', { name: 'Avg Week' }));
  expect(screen.getAllByText(/^\d check-ins?$/).length).toBeGreaterThan(0);
});

test('Log weigh-in fills today’s check-in, steps it and saves it', async () => {
  await renderBody();
  await fireEvent.press(screen.getByRole('button', { name: 'Log weigh-in' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Increase by 0.1 kg' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Update check-in' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/body-measurements', 'POST', {
      measurement_date: today,
      weight_kg: 84.3,
      body_fat_pct: null,
      notes: null,
    }),
  );
  expect(await screen.findByText('Check-in updated')).toBeOnTheScreen();
});

test('a check-in is edited from its menu, and a deleted one comes back with Undo', async () => {
  await renderBody();
  const actions = screen.getByLabelText(
    `Actions for ${prettyDate(measurements[1].measurement_date)}`,
  );
  await fireEvent.press(within(actions).getByText('Edit'));
  expect(await screen.findByText('Edit check-in')).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText('Body fat percentage'), '75');
  await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  expect(
    screen.getByText('Enter a body-fat percentage between 1 and 70, or leave it blank.'),
  ).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText('Body fat percentage'), '18');
  await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/body-measurements', 'POST', {
      measurement_date: measurements[1].measurement_date,
      weight_kg: 84.6,
      body_fat_pct: 18,
      notes: 'After travel',
    }),
  );

  jest.mocked(apiSend).mockClear();
  await fireEvent.press(within(actions).getByText('Delete check-in'));
  await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/body-measurements/m2', 'DELETE'));
  expect(await screen.findByText('Check-in deleted')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/body-measurements', 'POST', {
      measurement_date: measurements[1].measurement_date,
      weight_kg: 84.6,
      body_fat_pct: 18.5,
      notes: 'After travel',
    }),
  );
});

test('a new goal starts from the latest weigh-in and is checked first', async () => {
  await renderBody();
  await fireEvent.press(screen.getByRole('button', { name: 'New goal' }));
  expect(await screen.findByText('Add bodyweight goal')).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText('Target in kg'), '88');
  await fireEvent.changeText(screen.getByLabelText('Target date'), addDays(today, 90));
  await fireEvent.press(screen.getByRole('button', { name: 'Set goal' }));
  expect(
    screen.getByText('For a weight-loss goal, choose a target below your current 84.2 kg.'),
  ).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText('Target in kg'), '79');
  await fireEvent.press(screen.getByRole('button', { name: 'Set goal' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/body-weight-goals', 'POST', {
      start_date: today,
      target_date: addDays(today, 90),
      start_weight_kg: 84.2,
      target_weight_kg: 79,
      active: true,
    }),
  );
  expect(await screen.findByText('Goal set')).toBeOnTheScreen();
});

test('a removed goal hides at once, Undo brings it back, and otherwise it is deleted', async () => {
  await renderBody();
  jest.useFakeTimers();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit goal, 80 kg' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove goal' }));
  expect(screen.getByLabelText('Weight goal: –')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('button', { name: 'Edit goal, 80 kg' })).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Edit goal, 80 kg' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove goal' }));
  expect(apiSend).not.toHaveBeenCalledWith('/api/body-weight-goals/g1', 'DELETE');
  await act(() => jest.advanceTimersByTimeAsync(5000));
  expect(apiSend).toHaveBeenCalledWith('/api/body-weight-goals/g1', 'DELETE');
});

test('a part typed on the figure is saved into today’s measurements', async () => {
  responses['/api/body-sizes'] = [{ ...emptyBodySizeLog(addDays(today, -5)), waist_cm: 82 }];
  await renderBody();
  await fireEvent(screen.getByLabelText('Measurements on the body'), 'layout', {
    nativeEvent: { layout: { width: 350, height: 426 } },
  });
  expect(screen.getByRole('button', { name: 'Update waist, 82 cm' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Add neck' }));
  await fireEvent.changeText(screen.getByLabelText('Neck (cm)'), '38,5');
  await fireEvent(screen.getByLabelText('Neck (cm)'), 'submitEditing');
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/body-sizes', 'PUT', {
      ...emptyBodySizeLog(today),
      neck_cm: 38.5,
    }),
  );
  // Today's entry is shown now, with the earlier waist carried onto the figure.
  expect(screen.getByRole('button', { name: 'Update neck, 38.5 cm' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add waist, last 82 cm' })).toBeVisible();
});

test('choosing an outline offers to save it as the account’s sex', async () => {
  await renderBody();
  await fireEvent.press(screen.getByRole('tab', { name: 'Female' }));
  const [title, , buttons] = jest.mocked(Alert.alert).mock.calls.at(-1)!;
  expect(title).toBe('Save your sex as Female?');
  await act(async () => (buttons as AlertButton[]).find((b) => b.text === 'Save')!.onPress!());
  expect(apiSend).toHaveBeenCalledWith('/api/profile', 'PATCH', { sex: 'female' });
  expect(await screen.findByLabelText('Female, set on your profile')).toBeVisible();
});
