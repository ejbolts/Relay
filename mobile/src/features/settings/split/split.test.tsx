import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { addDays } from '../../../../../frontend/src/trainingSummary';
import type {
  Exercise,
  Routine,
  RoutineDay,
  TrainingPreferences,
  TrainingSplit,
} from '../../../../../frontend/src/types';
import { localDate } from '../../../../../frontend/src/utils';
import { DEFAULT_WORKOUT_TYPES } from '../../../../../frontend/src/workoutTypes';
import { apiGet, apiSend } from '../../../data/api';
import { showMenu } from '../../../ui/prompts';
import { showToast } from '../../../ui/Toast';
import { SplitEditorScreen } from './SplitEditorScreen';
import { SplitLibraryScreen } from './SplitLibraryScreen';

const mockRouter = { push: jest.fn(), back: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  // Header buttons render in place, so tests can press them.
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => ReactElement } }) =>
      options?.headerRight?.() ?? null,
  },
}));
jest.mock('../../../data/api', () => ({
  ...jest.requireActual<typeof import('../../../data/api')>('../../../data/api'),
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('../../../ui/prompts', () => ({ showMenu: jest.fn(), promptText: jest.fn() }));
jest.mock('../../../ui/Toast', () => ({ showToast: jest.fn() }));

const today = localDate();
const type = (id: string) => DEFAULT_WORKOUT_TYPES.find((item) => item.id === id)!;
const bench: Exercise = {
  id: 'bench',
  name: 'Bench press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: null,
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const set = {
  reps: null,
  weight_kg: null,
  duration_seconds: null,
  distance_km: null,
  rest_seconds: null,
  set_type: 'normal' as const,
};
const day = (typeId: string | null, sets = 3): RoutineDay => ({
  workout_type_id: typeId,
  workout_type: typeId ? type(typeId) : null,
  movements: typeId ? [{ exercise_id: 'bench', exercise: bench, sets: Array(sets).fill(set) }] : [],
});
const ppl: Routine = {
  id: 'ppl',
  name: 'Push / Pull / Legs',
  shared: false,
  days: [day('push'), day('pull'), day('lower'), day(null)],
};
const upper: Routine = {
  id: 'ul',
  name: 'Upper day',
  shared: false,
  days: [day('upper'), day(null)],
};
const split: TrainingSplit = {
  name: ppl.name,
  routine_id: 'ppl',
  enabled: true,
  start_date: today,
  progression: 'workouts',
  next_step: 0,
  next_date: today,
  steps: ppl.days.map((item) => ({ workout_type_id: item.workout_type_id })),
};
const preferences: TrainingPreferences = {
  preferred_weight_unit: 'kg',
  week_start: 'monday',
  zone2_goal_minutes: 150,
  weekly_muscle_set_goal: 10,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  mockParams = {};
  const responses: Record<string, unknown> = {
    '/api/routines': [ppl, upper],
    '/api/training-split': split,
    '/api/workout-types': DEFAULT_WORKOUT_TYPES,
    '/api/exercises': [bench],
    '/api/workouts/snapshot': { revision: '1', workouts: [] },
    '/api/training-preferences': preferences,
    '/api/cardio-preferences': { heart_rate_zones: [], goals: [] },
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    const key = path.split('?')[0];
    if (!(key in responses)) throw new Error(`Unexpected ${path}`);
    return responses[key];
  });
  jest
    .mocked(apiSend)
    .mockImplementation(async (path: string, _method, body) =>
      path.startsWith('/api/routines') && body ? { id: 'saved', ...(body as object) } : split,
    );
});

let client: QueryClient;
afterEach(() => client.clear());

async function show(element: ReactElement) {
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
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('the split library', () => {
  it('leads with the active split and its week, and marks templates already saved', async () => {
    await show(<SplitLibraryScreen />);
    expect(
      await screen.findByRole('button', { name: 'Push / Pull / Legs, 4 days, active' }),
    ).toBeTruthy();
    expect(screen.getByText('NEXT 7 DAYS')).toBeTruthy();
    expect(screen.getByText('Change schedule')).toBeTruthy();
    const pplTemplate = screen.getByRole('button', {
      name: 'Push / Pull / Legs template, already in My splits',
    });
    expect(pplTemplate).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Upper / Lower template' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/split/edit',
      params: { template: 'upper-lower' },
    });
  });

  it('uses another split from the chosen day', async () => {
    await show(<SplitLibraryScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Use split' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Starts a day later' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Use this split' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Using Upper day'));
    expect(apiSend).toHaveBeenCalledWith(`/api/routines/ul/use?on_date=${today}`, 'POST', {
      start_date: addDays(today, 1),
      progression: 'workouts',
    });
  });

  it('deletes a split only after confirming, and not the active one', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await show(<SplitLibraryScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Options for Push / Pull / Legs' }),
    );
    expect(jest.mocked(showMenu).mock.calls[0][1].map((item) => item.label)).toEqual([
      'Show on my profile',
    ]);
    await fireEvent.press(screen.getByRole('button', { name: 'Options for Upper day' }));
    jest
      .mocked(showMenu)
      .mock.calls[1][1].find((item) => item.label === 'Delete split')!
      .onPress();
    expect(alert.mock.calls[0][0]).toBe('Delete split?');
    expect(apiSend).not.toHaveBeenCalled();
    alert.mock.calls[0][2]!.find((button) => button.style === 'destructive')!.onPress!();
    await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/routines/ul', 'DELETE'));
  });
});

describe('the split editor', () => {
  it('starts a new split from a template and saves it into the library', async () => {
    mockParams = { template: 'ppl' };
    await show(<SplitEditorScreen />);
    expect(await screen.findByDisplayValue('Push / Pull / Legs')).toBeTruthy();
    expect(screen.getByText('Cycle · 4 days')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save split' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith('/api/routines', 'POST', {
      name: 'Push / Pull / Legs',
      shared: false,
      days: [
        expect.objectContaining({ workout_type_id: 'push', movements: [] }),
        expect.objectContaining({ workout_type_id: 'pull' }),
        expect.objectContaining({ workout_type_id: 'lower' }),
        expect.objectContaining({ workout_type_id: null }),
      ],
    });
    expect(showToast).toHaveBeenCalledWith('Split saved.');
  });

  it('edits the active split with its schedule: sets, rep ranges and days', async () => {
    mockParams = { id: 'ppl' };
    await show(<SplitEditorScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'One more set of Bench press on day 1' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Rep range for Bench press on day 1: Any' }),
    );
    jest
      .mocked(showMenu)
      .mock.calls.at(-1)![1]
      .find((item) => item.label === '8–12')!
      .onPress();
    await fireEvent.press(screen.getByRole('button', { name: 'Add rest day' }));
    expect(screen.getByText('Cycle · 5 days')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Active'), 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Save split' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    const [path, method, body] = jest.mocked(apiSend).mock.calls[0];
    expect([path, method]).toEqual(['/api/routines/ppl', 'PUT']);
    const saved = body as Routine & { schedule: TrainingSplit };
    expect(saved.days).toHaveLength(5);
    expect(saved.days[0].movements[0].sets).toHaveLength(4);
    expect(saved.days[0].movements[0].rep_range).toEqual({ min: 8, max: 12 });
    expect(saved.schedule).toEqual({ start_date: today, enabled: false, progression: 'workouts' });
  });

  it('picks existing exercises only, as the web routine editor does', async () => {
    mockParams = { id: 'ppl' };
    await show(<SplitEditorScreen />);
    await fireEvent.press((await screen.findAllByRole('button', { name: 'Add exercise' }))[0]);
    await fireEvent.changeText(await screen.findByLabelText('Search exercises'), 'Zercher');
    expect(screen.queryByRole('button', { name: 'Create new exercise' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Create / })).toBeNull();
  });

  it('explains what to fix instead of saving', async () => {
    mockParams = { id: 'ul' };
    await show(<SplitEditorScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Split name'), '  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save split' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a split name.');
    await fireEvent.changeText(screen.getByLabelText('Split name'), 'Upper day');
    await fireEvent.press(screen.getByRole('button', { name: 'Day 1 workout type: Upper body' }));
    await act(async () => jest.mocked(showMenu).mock.calls.at(-1)![1][0].onPress());
    await fireEvent.press(screen.getByRole('button', { name: 'Save split' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Include at least one workout day.');
    expect(apiSend).not.toHaveBeenCalled();
  });

  it('mixes workout types on a day and saves them with it', async () => {
    mockParams = { id: 'ul' };
    await show(<SplitEditorScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Add a workout type to day 1' }),
    );
    const choices = jest.mocked(showMenu).mock.calls.at(-1)![1];
    // The day's main type isn't offered again.
    expect(choices.map((item) => item.label)).not.toContain('Upper body');
    await act(async () => choices.find((item) => item.label === 'Cardio')!.onPress());
    expect(screen.getByText('Day 1 · Upper body + Cardio')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Day 1 workout type 2: Cardio' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save split' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    const [, , body] = jest.mocked(apiSend).mock.calls[0];
    const saved = body as Routine;
    expect(saved.days.map((item) => item.extra_workout_type_ids)).toEqual([['cardio'], []]);
  });

  it('removes an extra workout type from a mixed day', async () => {
    mockParams = { id: 'ul' };
    const mixed = { ...upper, days: [{ ...day('upper'), extra_workout_type_ids: ['cardio'] }] };
    jest.mocked(apiGet).mockImplementation(async (path: string) => {
      const key = path.split('?')[0];
      if (key === '/api/routines') return [ppl, mixed];
      if (key === '/api/training-split') return split;
      if (key === '/api/workout-types') return DEFAULT_WORKOUT_TYPES;
      if (key === '/api/exercises') return [bench];
      if (key === '/api/workouts/snapshot') return { revision: '1', workouts: [] };
      if (key === '/api/training-preferences') return preferences;
      return { heart_rate_zones: [], goals: [] };
    });
    await show(<SplitEditorScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Day 1 workout type 2: Cardio' }),
    );
    const options = jest.mocked(showMenu).mock.calls.at(-1)![1];
    await act(async () => options.find((item) => item.label === 'Remove from this day')!.onPress());
    expect(screen.getByText('Day 1 · Upper body')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /workout type 2/ })).toBeNull();
  });

  it('shows the weekly volume against the goals and which days supply it', async () => {
    mockParams = { id: 'ppl' };
    await show(<SplitEditorScreen />);
    const chest = await screen.findByRole('button', {
      name: 'Chest: 15.8 of 10 sets a week, on target',
    });
    await fireEvent.press(chest);
    expect(screen.getAllByText('+3 sets')).toHaveLength(3);
  });
});
