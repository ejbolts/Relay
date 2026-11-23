import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import type { MachinePhotoUsage } from '../../../../frontend/src/types';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { apiGet, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { showMenu, type MenuOption } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { ExercisePicker } from './ExercisePicker';
import { startLogger, swapExercise } from './loggerState';
import {
  bench,
  context,
  lastPush,
  press,
  pushDay,
  sessionId,
  startedAt,
  types,
} from './testFixtures';
import { useWorkout, WorkoutProvider } from './WorkoutProvider';
import { WorkoutSheet } from './WorkoutSheet';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('./restAlerts', () => ({
  askForRestAlerts: jest.fn(async () => undefined),
  syncRestAlert: jest.fn(async () => undefined),
}));
jest.mock('./workoutReminders', () => ({
  remindAboutRestAlerts: jest.fn(async () => undefined),
  syncInactiveReminder: jest.fn(async () => undefined),
  takeLaunchReminder: jest.fn(async () => undefined),
  onWorkoutReminderOpened: jest.fn(() => () => undefined),
}));
jest.mock('../../ui/prompts', () => ({
  promptText: jest.fn(),
  showMenu: jest.fn(),
  PromptHost: () => null,
}));
jest.mock('../../ui/Toast', () => ({
  showToast: jest.fn(),
  ToastHost: () => null,
  toastAccount: () => 'u1',
  toastAccountFor: () => 'u1',
  isToastAccountCurrent: () => true,
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  currentUser: jest.fn(),
  apiSend: jest.fn(),
  apiGet: jest.fn(async () => []),
}));
jest.mock('../../data/queries', () => {
  const fixtures = jest.requireActual<typeof import('./testFixtures')>('./testFixtures');
  return {
    ...jest.requireActual<typeof import('../../data/queries')>('../../data/queries'),
    useDashboard: () => ({ data: { recommendation: { category: 'push' } } }),
    useWorkoutHistory: () => ({ data: [fixtures.lastPush] }),
    useWorkoutTypes: () => ({
      data: fixtures.types,
      isPlaceholderData: false,
      fetchStatus: 'idle',
    }),
    useSavedExercises: () => ({ data: {} }),
    useExercises: () => ({ data: fixtures.exercises }),
    useTrainingPreferences: () => ({
      data: { preferred_weight_unit: 'kg', default_rest_seconds: 90, weekly_muscle_set_goal: 10 },
    }),
    useUpNext: jest.fn(),
    refreshTraining: jest.fn(async () => undefined),
  };
});

/** A saved machine for Overhead Press, last used on 18 November. */
const hammer: MachinePhotoUsage = {
  id: 'hammer',
  exercise_id: 'press',
  caption: 'Hammer Strength press',
  thumbnail_url: '',
  full_url: '',
  width: 1,
  height: 1,
  created_at: '',
  exercise_name: 'Overhead Press',
  workout_count: 2,
  last_used_date: '2026-11-18',
};
/** A press session on the Hammer machine at 40 kg, the replacement's history on that machine. */
const pressOnHammer = {
  ...lastPush,
  id: 'press-on-hammer',
  workout_date: '2026-11-18',
  movements: [
    {
      ...lastPush.movements[0],
      exercise: press,
      machine_photos: [hammer],
      sets: lastPush.movements[0].sets.map((item) => ({
        ...item,
        weight_kg: 40,
        machine_photo_id: 'hammer',
      })),
    },
  ],
};

const user = { id: 'u1', username: 'preview' } as Awaited<ReturnType<typeof currentUser>>;
let client: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(currentUser).mockResolvedValue(user);
  jest.mocked(useUpNext).mockReturnValue({
    template: pushDay,
    label: 'Push',
    recommendation: { category: 'push' },
    type: types.find((type) => type.id === 'push'),
  } as unknown as ReturnType<typeof useUpNext>);
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) => (path === '/api/machine-photos' ? [hammer] : []));
});
afterEach(() => client?.clear());

function pushDayLogger() {
  return startLogger(
    {
      template: pushDay,
      startCategory: null,
      startType: null,
      recommendationCategory: 'push',
      types,
      date: '2026-11-22',
      now: startedAt,
      clientSessionId: sessionId,
    },
    context(),
  );
}

describe('swapping onto a machine', () => {
  it('pins the chosen machine and plans loads from its last session on that machine', () => {
    const state = pushDayLogger();
    const swapped = swapExercise(
      state,
      state.movements[0].key,
      press,
      context({ workouts: [lastPush, pressOnHammer] }),
      { press: 'hammer' },
    );
    expect(swapped.movements[0]).toMatchObject({
      machinePhotoIds: ['hammer'],
      machinePhotosInitialized: true,
    });
    expect(swapped.movements[0].sets.map((item) => item.weight_kg)).toEqual([40, 40]);
  });

  it('with the baseline exercise chosen, pins no machine', () => {
    const state = pushDayLogger();
    const swapped = swapExercise(state, state.movements[0].key, press, context(), {
      press: null,
    });
    expect(swapped.movements[0]).toMatchObject({
      machinePhotoIds: [],
      machinePhotosInitialized: true,
    });
  });

  it('without a choice, leaves the machine for the logger to restore from its last session', () => {
    const state = pushDayLogger();
    const swapped = swapExercise(state, state.movements[0].key, press, context());
    expect(swapped.movements[0]).toMatchObject({
      machinePhotoIds: [],
      machinePhotosInitialized: false,
    });
  });
});

describe("the picker's Swap exercise mode", () => {
  async function openSwapPicker() {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const onAdd = jest.fn();
    const onClose = jest.fn();
    await render(
      <QueryClientProvider client={client}>
        <ExercisePicker
          visible
          mode="swap"
          exercises={[bench, press]}
          recentIds={[]}
          addedIds={new Set(['bench'])}
          chooseMachines
          onAdd={onAdd}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('button', { name: 'Show machines for Overhead Press' }),
    ).toBeVisible();
    return { onAdd, onClose };
  }

  it('picks a replacement with machines on its last-used machine, and Swap exercise confirms', async () => {
    const { onAdd, onClose } = await openSwapPicker();
    expect(screen.queryByRole('button', { name: 'Swap exercise' })).toBeNull();
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })),
    );
    // Picking it opens its machines instead of swapping straight away.
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Hammer Strength press' })).toBeChecked();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Swap exercise' })));
    expect(onAdd).toHaveBeenCalledWith([press], { press: 'hammer' });
    expect(onClose).toHaveBeenCalled();
  });

  it('swaps onto the baseline exercise when its machine is tapped off', async () => {
    const { onAdd } = await openSwapPicker();
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })),
    );
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Hammer Strength press' })),
    );
    expect(screen.getByText('Baseline exercise')).toBeVisible();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Swap exercise' })));
    expect(onAdd).toHaveBeenCalledWith([press], { press: null });
  });

  it('still swaps on one tap to an exercise without saved machines', async () => {
    jest
      .mocked(apiGet)
      .mockImplementation(async (path: string) =>
        path === '/api/machine-photos' ? [{ ...hammer, exercise_id: 'bench' }] : [],
      );
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const onAdd = jest.fn();
    await render(
      <QueryClientProvider client={client}>
        <ExercisePicker
          visible
          mode="swap"
          exercises={[bench, press]}
          recentIds={[]}
          addedIds={new Set()}
          chooseMachines
          onAdd={onAdd}
          onClose={jest.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: 'Show machines for Bench Press' });
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })),
    );
    expect(onAdd).toHaveBeenCalledWith([press], {});
  });
});

test('the logger swaps an exercise onto the machine chosen in Browse all exercises', async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const captured: { start?: ReturnType<typeof useWorkout>['start'] } = {};
  function Probe() {
    const workout = useWorkout();
    useEffect(() => {
      captured.start = workout.start;
    });
    return null;
  }
  await render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <WorkoutProvider>
          <WorkoutSheet />
          <Probe />
        </WorkoutProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(captured.start).toBeDefined());
  await act(async () => captured.start!({ kind: 'up-next' }));
  expect(await screen.findByText('Bench Press')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Actions for Bench Press' }));
  const options = jest.mocked(showMenu).mock.calls[0][1] as MenuOption[];
  await act(async () => options.find((item) => item.label === 'Swap exercise')!.onPress());
  await fireEvent.press(await screen.findByRole('button', { name: 'Browse all exercises' }));
  await screen.findByRole('button', { name: 'Show machines for Overhead Press' });
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Swap exercise' })));

  expect(jest.mocked(showToast).mock.calls.at(-1)?.[0]).toBe('Swapped to Overhead Press');
  const movement = readActiveWorkoutDraft(deviceStorage)?.movements[0];
  expect(movement).toMatchObject({ exerciseId: 'press', machinePhotoIds: ['hammer'] });
});
