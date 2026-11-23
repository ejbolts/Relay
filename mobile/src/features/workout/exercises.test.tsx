import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { Platform } from 'react-native';
import type { Exercise, ExerciseCreateInput } from '../../../../frontend/src/types';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { apiGet, apiSend, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { showMenu, type MenuOption } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { restTimesPreference } from '../settings/devicePreferences';
import { ExercisePicker } from './ExercisePicker';
import { addExercises, chooseMachines, startLogger, swapExercise } from './loggerState';
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
jest.mock('../../ui/prompts', () => ({
  promptText: jest.fn(),
  showMenu: jest.fn(),
  PromptHost: () => null,
}));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
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
    useDashboard: () => ({
      data: {
        recommendation: { category: 'push' },
        weekly_sets: {
          week_start: '2000-01-03',
          week_end: '2999-12-31',
          muscle_groups: [{ muscle_group: 'Chest', raw_sets: 3, contributions: [] }],
        },
      },
    }),
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
});
afterEach(() => client?.clear());

async function openLogger() {
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
  await waitFor(() => expect(currentUser).toHaveBeenCalled());
  await waitFor(() => expect(captured.start).toBeDefined());
  await act(async () => captured.start!({ kind: 'up-next' }));
  expect(await screen.findByText('Bench Press')).toBeVisible();
}

const option = (options: MenuOption[], label: string) => {
  const found = options.find((item) => item.label === label);
  if (!found) throw new Error(`No ${label} in ${options.map((item) => item.label).join(', ')}`);
  return found;
};

describe('swapping an exercise', () => {
  it('keeps logged sets on the original and moves planned sets to the replacement', () => {
    const state = startLogger(
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
    const key = state.movements[0].key;
    const logged = {
      ...state,
      movements: [
        {
          ...state.movements[0],
          sets: state.movements[0].sets.map((item, index) => ({
            ...item,
            completed: index === 0,
          })),
        },
      ],
    };
    const swapped = swapExercise(logged, key, press, context());
    expect(swapped.movements.map((item) => [item.exercise.id, item.sets.length])).toEqual([
      ['bench', 1],
      ['press', 1],
    ]);
    expect(swapped.movements[1]).toMatchObject({ swappedFrom: 'Bench Press', isComplete: false });
    // The planned set keeps its reps; the load comes from the replacement's own history (none).
    expect(swapped.movements[1].sets[0]).toMatchObject({
      completed: false,
      reps: 7,
      weight_kg: null,
    });
  });

  it('is offered from the exercise menu and can be undone', async () => {
    await openLogger();
    await fireEvent.press(screen.getByRole('button', { name: 'Actions for Bench Press' }));
    await act(async () =>
      option(jest.mocked(showMenu).mock.calls[0][1], 'Swap exercise').onPress(),
    );
    expect(await screen.findByText('Swap Bench Press')).toBeVisible();
    expect(screen.getByText('2 planned sets move across')).toBeVisible();
    // Nothing in the sample library trains the same muscles, so browse every exercise.
    expect(screen.getByText('No close alternatives')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Browse all exercises' }));
    expect(screen.getByText('Swap exercise')).toBeVisible();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' }));
    expect(screen.getByText('Swapped from Bench Press')).toBeVisible();
    expect(readActiveWorkoutDraft(deviceStorage)?.movements.map((item) => item.exerciseId)).toEqual(
      ['press'],
    );
    const [message, undo] = jest.mocked(showToast).mock.calls.at(-1)!;
    expect(message).toBe('Swapped to Overhead Press');
    await act(async () => undo!.run());
    expect(readActiveWorkoutDraft(deviceStorage)?.movements.map((item) => item.exerciseId)).toEqual(
      ['bench'],
    );
  });
});

test('an exercise that is not there can be created from the search, then added', async () => {
  const created: Exercise = { ...bench, id: 'sissy', name: 'Sissy Squat', category: 'lower' };
  jest.mocked(apiSend).mockResolvedValueOnce(created);
  await openLogger();
  await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'sissy squat');
  await fireEvent.press(screen.getByRole('button', { name: 'Create Sissy Squat' }));
  expect(screen.getByLabelText('Exercise name').props.value).toBe('Sissy Squat');
  await fireEvent.press(screen.getByRole('radio', { name: 'Lower body' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Target muscle 1: Choose muscle' }));
  const muscles = jest.mocked(showMenu).mock.calls.at(-1)![1];
  await act(async () => option(muscles, 'Chest').onPress());
  await fireEvent.press(screen.getByRole('button', { name: 'Save exercise' }));
  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith('/api/exercises', 'POST', {
      name: 'Sissy Squat',
      category: 'lower',
      kind: 'strength',
      muscle_group: 'Chest',
      equipment: null,
      muscle_set_credits: [{ muscle_name: 'Chest', sets: 1 }],
    } satisfies ExerciseCreateInput),
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Add 1' }));
  expect(readActiveWorkoutDraft(deviceStorage)?.movements.map((item) => item.exerciseId)).toEqual([
    'bench',
    'sissy',
  ]);
});

test('a name already in the library is flagged, with the existing exercise to use', async () => {
  await openLogger();
  await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Create new exercise' }));
  await fireEvent.changeText(screen.getByLabelText('Exercise name'), 'Overhead press');
  expect(screen.getByText('Already in your library')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save exercise' })).toBeDisabled();
  await fireEvent.press(screen.getByText('Use Overhead Press'));
  await fireEvent.press(screen.getByRole('button', { name: 'Add 1' }));
  expect(readActiveWorkoutDraft(deviceStorage)?.movements.map((item) => item.exerciseId)).toEqual([
    'bench',
    'press',
  ]);
  expect(apiSend).not.toHaveBeenCalledWith('/api/exercises', 'POST', expect.anything());
});

test('a logged working set shows what it adds to the week', async () => {
  await openLogger();
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  expect(screen.getByLabelText('Chest 4 of 10 weekly sets, up 1')).toBeVisible();
  // Unticking it takes the shelf away.
  await fireEvent.press(screen.getByRole('button', { name: 'Mark set 1 incomplete' }));
  expect(screen.queryByLabelText(/weekly sets/)).toBeNull();
});

describe('machines', () => {
  const machineHistory = {
    ...lastPush,
    id: 'on-machine',
    workout_date: '2026-11-18',
    movements: [
      {
        ...lastPush.movements[0],
        machine_photos: [
          {
            id: 'cybex',
            exercise_id: 'bench',
            caption: 'Cybex',
            thumbnail_url: '',
            full_url: '',
            width: 1,
            height: 1,
            created_at: '',
          },
        ],
        sets: lastPush.movements[0].sets.map((item) => ({ ...item, weight_kg: 60 })),
      },
    ],
  };

  it("choosing a machine suggests its own last session's sets", () => {
    const state = startLogger(
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
      context({ workouts: [lastPush, machineHistory] }),
    );
    const key = state.movements[0].key;
    const chosen = chooseMachines(
      state,
      key,
      ['cybex'],
      { chosen: true, aliases: new Map() },
      context({ workouts: [lastPush, machineHistory] }),
    );
    expect(chosen.movements[0].machinePhotoIds).toEqual(['cybex']);
    expect(chosen.movements[0].sets.map((item) => item.weight_kg)).toEqual([60, 60]);
    // A restored pin leaves the suggestions as they are.
    const restored = chooseMachines(
      state,
      key,
      ['cybex'],
      { chosen: false, aliases: new Map() },
      context({ workouts: [lastPush, machineHistory] }),
    );
    expect(restored.movements[0].sets).toBe(state.movements[0].sets);
  });

  it('a new movement starts on the machine its last session used, shown on its card', async () => {
    jest.mocked(apiGet).mockImplementation(async (path: string) =>
      path.endsWith('/machine-photos/last-used')
        ? machineHistory.movements[0].machine_photos
        : path.includes('/machine-photos')
          ? [
              {
                ...machineHistory.movements[0].machine_photos[0],
                workout_count: 1,
                last_used_date: '2026-11-18',
              },
            ]
          : [],
    );
    await openLogger();
    expect(await screen.findByRole('button', { name: 'Machine: Cybex' })).toBeVisible();
    expect(readActiveWorkoutDraft(deviceStorage)?.movements[0].machinePhotoIds).toEqual(['cybex']);
  });
});

describe('rest times between sets', () => {
  it('adds a rest between two sets, changes it, removes it, and slots a set in', async () => {
    await openLogger();
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Add rest after set 1' })),
    );
    const [, adding] = jest.mocked(showMenu).mock.calls.at(-1)!;
    await act(async () => option(adding, '1:30').onPress());
    expect(await screen.findByRole('button', { name: 'Rest after set 1: 1:30' })).toBeVisible();

    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Rest after set 1: 1:30' })),
    );
    const [, changing] = jest.mocked(showMenu).mock.calls.at(-1)!;
    await act(async () => option(changing, '2:00').onPress());
    expect(await screen.findByRole('button', { name: 'Rest after set 1: 2:00' })).toBeVisible();

    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Rest after set 1: 2:00' })),
    );
    const [, removing] = jest.mocked(showMenu).mock.calls.at(-1)!;
    await act(async () => option(removing, 'No rest').onPress());
    expect(showToast).toHaveBeenCalledWith(
      'Rest removed',
      expect.objectContaining({ label: 'Undo' }),
    );
    expect(await screen.findByRole('button', { name: 'Add rest after set 1' })).toBeVisible();

    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Add set before set 2' })),
    );
    expect(await screen.findByRole('button', { name: 'Complete set 3' })).toBeVisible();
  });

  it('hides the rest rows when Show rest times is off', async () => {
    restTimesPreference.set(false);
    await openLogger();
    expect(screen.queryByRole('button', { name: 'Add rest after set 1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add set before set 2' })).toBeVisible();
    restTimesPreference.set(true);
  });
});

describe('picking exercises', () => {
  const cybex = {
    id: 'cybex',
    exercise_id: 'bench',
    exercise_name: 'Bench Press',
    caption: 'Cybex',
    thumbnail_url: '',
    full_url: '',
    width: 1,
    height: 1,
    created_at: '',
    workout_count: 2,
    last_used_date: '2026-11-18',
  };

  async function openPicker(props: Partial<ComponentProps<typeof ExercisePicker>> = {}) {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const onAdd = jest.fn();
    const onCreateSuperset = jest.fn();
    await render(
      <QueryClientProvider client={client}>
        <ExercisePicker
          visible
          exercises={[bench, press]}
          recentIds={[]}
          addedIds={new Set()}
          chooseMachines
          onAdd={onAdd}
          onCreateSuperset={onCreateSuperset}
          onClose={jest.fn()}
          {...props}
        />
      </QueryClientProvider>,
    );
    return { onAdd, onCreateSuperset };
  }

  it('starts a picked exercise on its last-used machine, and tapping it again uses none', async () => {
    jest
      .mocked(apiGet)
      .mockImplementation(async (path: string) => (path === '/api/machine-photos' ? [cybex] : []));
    const { onAdd } = await openPicker();
    expect(
      await screen.findByRole('button', { name: 'Show machines for Bench Press' }),
    ).toBeVisible();
    await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Bench Press' })));
    expect(screen.getByRole('checkbox', { name: 'Cybex' })).toBeChecked();
    await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Cybex' })));
    expect(screen.getByText('Baseline exercise')).toBeVisible();
    await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Cybex' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Add 1' })));
    expect(onAdd).toHaveBeenCalledWith([bench], { bench: 'cybex' });
  });

  it('adds two or more picks as a superset', async () => {
    jest.mocked(apiGet).mockImplementation(async () => []);
    const { onCreateSuperset } = await openPicker();
    const add = screen.getByRole('button', { name: 'Add superset' });
    expect(add).toBeDisabled();
    await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })));
    await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Bench Press' })));
    await act(async () => fireEvent.press(add));
    expect(onCreateSuperset).toHaveBeenCalledWith([press, bench], {});
  });

  it('adds the picks to the workout on their machines, grouped as a superset', () => {
    const state = startLogger(
      {
        template: null,
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
    const onMachine = {
      ...lastPush,
      id: 'on-machine',
      movements: [
        {
          ...lastPush.movements[0],
          machine_photos: [cybex],
          sets: lastPush.movements[0].sets.map((item) => ({ ...item, weight_kg: 60 })),
        },
      ],
    };
    const next = addExercises(
      state,
      [bench, press],
      context({ workouts: [lastPush, onMachine] }),
      { bench: 'cybex' },
      'group',
    );
    expect(next.movements.map((item) => item.machinePhotoIds)).toEqual([['cybex'], []]);
    expect(next.movements[0].sets.map((item) => item.weight_kg)).toEqual([60, 60]);
    expect(next.movements.map((item) => item.supersetKey)).toEqual(['group', 'group']);
  });
});
