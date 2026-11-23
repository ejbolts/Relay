import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ReactElement } from 'react';
import { localDate } from '../../../../frontend/src/utils';
import { apiGet, apiSend } from '../../data/api';
import { uploadFile } from '../../data/uploadFile';
import { showMenu } from '../../ui/prompts';
import { Alert } from 'react-native';
import { CardioSection } from '../training/CardioSection';
import { CardioEditScreen, CardioLogScreen } from './CardioLogScreen';
import { CardioMetricsScreen } from './CardioMetricsScreen';
import { CardioZonesScreen } from './CardioZonesScreen';

jest.mock('../../data/api', () => ({ apiGet: jest.fn(), apiSend: jest.fn() }));
jest.mock('../../data/uploadFile', () => ({ uploadFile: jest.fn() }));
jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn() }));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../body/DateField', () => ({ DateField: () => null }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock('./CardioShareSheet', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CardioShareSheet: ({ session }: { session: { activity_type: string } }) => (
      <Text>Sharing {session.activity_type}</Text>
    ),
  };
});
jest.mock('../../data/queries', () => ({
  ...jest.requireActual<typeof import('../../data/queries')>('../../data/queries'),
  useWeightUnit: () => 'kg',
  refreshTraining: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter,
}));

const mockRouter = { back: jest.fn(), push: jest.fn() };
let mockParams: Record<string, string> = { id: 'session-1' };
// The screen's native transition: tests end it by calling the listener it registered.
const mockTransitionEnd: ((event: { data: { closing: boolean } }) => void)[] = [];
const mockNavigation = {
  isFocused: () => true,
  addListener: (type: string, listener: (event: { data: { closing: boolean } }) => void) => {
    if (type === 'transitionEnd') mockTransitionEnd.push(listener);
    return () => undefined;
  },
};
const arrive = () =>
  act(async () => mockTransitionEnd.forEach((listener) => listener({ data: { closing: false } })));
const exercise = { id: 'treadmill', name: 'Incline Treadmill Walking', kind: 'cardio' };
const session = {
  id: 'session-1',
  activity_type: exercise.name,
  session_date: localDate(),
  duration_minutes: 34,
  calories_kcal: 218,
  average_heart_rate_bpm: 126,
};
let client: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'session-1' };
  mockTransitionEnd.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  jest
    .mocked(apiGet)
    .mockImplementation(async (path) =>
      path === '/api/exercises' ? [exercise] : { sessions: [session] },
    );
  jest.mocked(apiSend).mockResolvedValue({ source_workout_id: null });
});
afterEach(() => client.clear());

async function open(component: ReactElement) {
  await render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
}

it('opens the chosen picker once the screen has arrived, and leaves the form usable after cancel', async () => {
  mockParams = { import: 'library' };
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: true,
    assets: null,
  });
  await open(<CardioLogScreen />);
  const minutes = await screen.findByLabelText('Minutes');
  // Not while the screen is still sliding in.
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  await arrive();
  await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
  // A closing transition or a second arrival doesn't open it again.
  await arrive();
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  expect(showMenu).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Import screenshot' })).toBeEnabled();
  expect(minutes).toHaveProp('editable', true);
  expect(apiSend).not.toHaveBeenCalled();
});

it('keeps the form usable while a picker it opened never answers', async () => {
  mockParams = { import: 'library' };
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockReturnValue(new Promise(() => undefined));
  await open(<CardioLogScreen />);
  const minutes = await screen.findByLabelText('Minutes');
  await arrive();
  await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Import screenshot' })).toBeEnabled();
  expect(minutes).toHaveProp('editable', true);
  await fireEvent.changeText(minutes, '41');
  expect(minutes).toHaveProp('value', '41');
});

it('says how to allow the camera when it is denied, and the form stays usable', async () => {
  mockParams = { import: 'camera' };
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
    granted: false,
  } as Awaited<ReturnType<typeof ImagePicker.requestCameraPermissionsAsync>>);
  await open(<CardioLogScreen />);
  const minutes = await screen.findByLabelText('Minutes');
  await arrive();
  expect(
    await screen.findByText('Allow camera access in your phone’s settings to take a photo.'),
  ).toBeOnTheScreen();
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Import screenshot' })).toBeEnabled();
  expect(minutes).toHaveProp('editable', true);
});

it('reviews a picked screenshot before writing and prevents an invalid session', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: 'file:///sample.png',
        width: 540,
        height: 960,
        fileName: 'sample.png',
        mimeType: 'image/png',
      },
    ],
  });
  jest.mocked(uploadFile).mockResolvedValue({
    activity_type: exercise.name,
    session_date: null,
    duration_minutes: 45,
    calories_kcal: 318,
    average_heart_rate_bpm: 131,
    distance_km: 3.75,
    average_speed_kph: null,
    fields_found: ['duration', 'active calories', 'heart rate', 'distance'],
    warning: null,
  });
  await open(<CardioLogScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Import screenshot' }));
  const choose = jest
    .mocked(showMenu)
    .mock.calls[0][1].find(({ label }) => label === 'Choose screenshot');
  await act(async () => choose?.onPress());
  const minutes = await screen.findByLabelText('Minutes');
  await waitFor(() => expect(minutes).toHaveProp('value', '45'));
  expect(screen.getByLabelText('Active calories (kcal)')).toHaveProp('value', '318');
  expect(apiSend).not.toHaveBeenCalled();
  expect(uploadFile).toHaveBeenCalledWith(
    '/api/cardio/scan',
    'POST',
    {
      uri: 'file:///sample.png',
      name: 'sample.png',
      type: 'image/png',
    },
    expect.anything(),
  );

  const add = screen.getByRole('button', { name: 'Add cardio session' });
  await fireEvent.changeText(minutes, '0');
  await fireEvent.press(add);
  expect(screen.getByText('Enter whole minutes from 1 to 1,440.')).toBeOnTheScreen();
  expect(apiSend).not.toHaveBeenCalled();
  await fireEvent.changeText(minutes, '46');
  await fireEvent.press(add);
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith(
      '/api/cardio',
      'POST',
      expect.objectContaining({
        session_date: session.session_date,
        exercise_id: exercise.id,
        duration_minutes: 46,
        calories_kcal: 318,
        average_heart_rate_bpm: 131,
        distance_km: 3.75,
        intensity: null,
        qualifies_zone2: false,
      }),
    ),
  );
});

it('clears a metric without replacing the session itself', async () => {
  await open(<CardioMetricsScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Calories (kcal)'), '');
  await fireEvent.press(screen.getByRole('button', { name: 'Save metrics' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/cardio/session-1/metrics', 'PATCH', {
      calories_kcal: null,
      average_heart_rate_bpm: 126,
      distance_km: null,
      average_speed_kph: null,
      incline_percent: null,
      average_power_watts: null,
      average_mets: null,
      elevation_gain_m: null,
    }),
  );
});

it('fills five zones and supports adding a weekly goal for another zone', async () => {
  await open(<CardioZonesScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Max heart rate'), '190');
  await fireEvent.press(screen.getByRole('button', { name: 'Fill zones' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add goal' }));
  await fireEvent.changeText(screen.getByLabelText('Goal 2 minutes'), '45');
  await fireEvent.press(screen.getByRole('button', { name: 'Save zones & goals' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/cardio-preferences', 'PUT', {
      heart_rate_zones: [
        { zone: 1, min_bpm: 95, max_bpm: 113 },
        { zone: 2, min_bpm: 114, max_bpm: 132 },
        { zone: 3, min_bpm: 133, max_bpm: 151 },
        { zone: 4, min_bpm: 152, max_bpm: 170 },
        { zone: 5, min_bpm: 171, max_bpm: 190 },
      ],
      goals: [
        { zone: 2, minutes: 150 },
        { zone: 1, minutes: 45 },
      ],
    }),
  );
});

const week = { week_start: '2026-11-16', week_end: '2026-11-22' };
const overview = (sessions: object[]) => ({
  sessions,
  current_week: week,
  energy_periods: [],
  goal_weeks: [],
  cardio_preferences: null,
});
const historySession = (id: string, workout: string | null, extra = {}) => ({
  ...session,
  id,
  activity_type: `Row ${id}`,
  session_date: '2026-11-18',
  source_workout_id: workout,
  workout_context: 'pure_cardio',
  ...extra,
});

it('edits every field of a session logged on its own', async () => {
  await open(<CardioEditScreen sessionId="session-1" />);
  await fireEvent.changeText(await screen.findByLabelText('Minutes'), '40');
  await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(apiSend).toHaveBeenCalled());
  const [path, method, body] = jest.mocked(apiSend).mock.calls[0];
  expect([path, method]).toEqual(['/api/cardio/session-1', 'PUT']);
  expect(body).toMatchObject({
    exercise_id: 'treadmill',
    activity_type: exercise.name,
    duration_minutes: 40,
    calories_kcal: 218,
    average_heart_rate_bpm: 126,
    zone: null,
    qualifies_zone2: false,
  });
});

it('deletes standalone sessions and lone cardio workouts, and shares a card', async () => {
  jest
    .mocked(apiGet)
    .mockImplementation(async () =>
      overview([
        historySession('a', null),
        historySession('b', 'w1'),
        historySession('c', 'w2', { workout_context: 'workout_plus_cardio' }),
      ]),
    );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await open(<CardioSection />);
  const row = async (name: string) => {
    await fireEvent.press(await screen.findByRole('button', { name: new RegExp(`^${name},`) }));
  };
  await row('Row a');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
  await act(async () =>
    alert.mock.calls
      .at(-1)![2]!
      .find((button) => button.text === 'Delete session')!
      .onPress?.(),
  );
  expect(apiSend).toHaveBeenLastCalledWith('/api/cardio/a', 'DELETE');

  await row('Row b');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
  await act(async () =>
    alert.mock.calls
      .at(-1)![2]!
      .find((button) => button.text === 'Delete session')!
      .onPress?.(),
  );
  expect(apiSend).toHaveBeenLastCalledWith('/api/workouts/w1', 'DELETE');

  // A session inside a strength workout is edited and removed in that workout.
  await row('Row c');
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: /in its workout$/ }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/edit-workout/[id]',
    params: { id: 'w2' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Share card' }));
  expect(screen.getByText('Sharing Row c')).toBeVisible();
});
