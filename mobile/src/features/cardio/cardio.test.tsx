import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ReactElement } from 'react';
import { localDate } from '../../../../frontend/src/utils';
import { apiGet, apiSend } from '../../data/api';
import { uploadFile } from '../../data/uploadFile';
import { showMenu } from '../../ui/prompts';
import { CardioLogScreen } from './CardioLogScreen';
import { CardioMetricsScreen } from './CardioMetricsScreen';
import { CardioZonesScreen } from './CardioZonesScreen';

jest.mock('../../data/api', () => ({ apiGet: jest.fn(), apiSend: jest.fn() }));
jest.mock('../../data/uploadFile', () => ({ uploadFile: jest.fn() }));
jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn() }));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../body/DateField', () => ({ DateField: () => null }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'session-1' }),
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ back: jest.fn() }),
}));

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
