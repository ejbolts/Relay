import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { CardioSession, TrackedWorkout } from '../../../../frontend/src/types';
import { CardioShareSheet } from '../cardio/CardioShareSheet';
import { ShareWorkoutSheet } from './ShareWorkoutSheet';

jest.mock('../../data/queries', () => ({ useWeightUnit: () => 'kg' }));
jest.mock('@react-native-segmented-control/segmented-control', () => () => null);
jest.mock('./workoutShare', () => ({
  workoutCardLogo: jest.fn(async () => ''),
  workoutCardHeight: () => 600,
  shareWorkoutCard: jest.fn(async () => undefined),
  exportWorkoutCsv: jest.fn(async () => undefined),
}));

const workout = {
  id: 'w1',
  name: 'Upper A',
  workout_date: '2026-03-02',
  duration_minutes: 60,
  movements: [],
  cardio_sessions: [],
} as unknown as TrackedWorkout;

const cardio = {
  id: 'c1',
  activity_type: 'Run',
  session_date: '2026-03-02',
  duration_minutes: 30,
  distance_km: 5,
} as unknown as CardioSession;

const show = (element: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {element}
    </SafeAreaProvider>,
  );

test('a workout card offers Share image and Export CSV', async () => {
  await show(<ShareWorkoutSheet workout={workout} records={0} onClose={() => undefined} />);
  expect(await screen.findByRole('button', { name: 'Share image' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Export CSV' })).toBeVisible();
});

test('a cardio card shares through the same sheet, without Export CSV', async () => {
  await show(<CardioShareSheet session={cardio} onClose={() => undefined} />);
  expect(await screen.findByRole('button', { name: 'Share image' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
});
