import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import type { MachinePhotoUsage } from '../../../../frontend/src/types';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { ApiError, apiGet, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { showMenu, type MenuOption } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { ExercisePicker } from './ExercisePicker';
import {
  checkFinish,
  finishInput,
  startLogger,
  swapExercise,
  updateSet,
  type LoggerState,
} from './loggerState';
import { askForMachinePhoto, uploadMachinePhoto } from './machineMedia';
import { swapOntoMachine } from './swapMachineSetup';
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
jest.mock('./machineMedia', () => ({
  ...jest.requireActual<typeof import('./machineMedia')>('./machineMedia'),
  askForMachinePhoto: jest.fn(),
  uploadMachinePhoto: jest.fn(),
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
  toastAccount: () => mockAccount,
  toastAccountFor: () => mockAccount,
  isToastAccountCurrent: (account: string) => account === mockAccount,
}));
jest.mock('../../data/session', () => ({
  sessionToken: jest.fn(async () => 'token'),
  forgetSessionTokenIf: jest.fn(async () => undefined),
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  serverOrigin: () => 'https://relay.test',
  currentUser: jest.fn(),
  apiSend: jest.fn(),
  apiGet: jest.fn(async () => []),
}));
jest.mock('../../data/queries', () => {
  const fixtures = jest.requireActual<typeof import('./testFixtures')>('./testFixtures');
  return {
    ...jest.requireActual<typeof import('../../data/queries')>('../../data/queries'),
    useDashboard: () => ({ data: { recommendation: { category: 'push' } } }),
    useWorkoutHistory: () => ({ data: mockHistory ?? [fixtures.lastPush] }),
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

/** Cybex, the more recent of Overhead Press's two machines, so the one picked by default. */
const cybex: MachinePhotoUsage = {
  ...hammer,
  id: 'cybex',
  caption: 'Cybex press',
  workout_count: 5,
  last_used_date: '2026-11-20',
};
/** A press session on Cybex at 85 kg. */
const pressOnCybex = {
  ...pressOnHammer,
  id: 'press-on-cybex',
  workout_date: '2026-11-20',
  movements: pressOnHammer.movements.map((movement) => ({
    ...movement,
    machine_photos: [cybex],
    sets: movement.sets.map((item) => ({ ...item, weight_kg: 85, machine_photo_id: 'cybex' })),
  })),
};
const hammerSettings = [{ name: 'Seat', value: '4' }];

/** Answers for the API, by path; anything else is an empty list. */
let routes: Record<string, unknown> = {};
let mockAccount = 'u1';
let mockHistory: (typeof lastPush)[] | null = null;

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
  mockAccount = 'u1';
  mockHistory = null;
  routes = { '/api/machine-photos': [hammer] };
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) => (path in routes ? routes[path] : []) as never);
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
    expect(onAdd).toHaveBeenCalledWith([press], { press: 'hammer' }, { hammer: 2 });
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
    expect(onAdd).toHaveBeenCalledWith([press], { press: null }, {});
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

test('the logger swaps onto the machine chosen in Browse all, with its loads and setup', async () => {
  // Cybex was used last, so it is picked by default; Hammer is chosen instead.
  mockHistory = [lastPush, pressOnHammer, pressOnCybex];
  routes = {
    '/api/machine-photos': [cybex, hammer],
    '/api/exercises/press/machine-settings?machine_photo_id=hammer': { settings: hammerSettings },
  };
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
  expect(screen.getByRole('checkbox', { name: 'Cybex press' })).toBeChecked();
  await act(async () =>
    fireEvent.press(screen.getByRole('checkbox', { name: 'Hammer Strength press' })),
  );
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Swap exercise' })));

  expect(jest.mocked(showToast).mock.calls.at(-1)?.[0]).toBe('Swapped to Overhead Press');
  await waitFor(() =>
    expect(readActiveWorkoutDraft(deviceStorage)?.movements[0]).toMatchObject({
      exerciseId: 'press',
      machinePhotoIds: ['hammer'],
      machineSettings: hammerSettings,
    }),
  );
  // Hammer's own last session, not Cybex's 85 kg.
  expect(
    readActiveWorkoutDraft(deviceStorage)?.movements[0].sets.map((item) => item.weight_kg),
  ).toEqual([40, 40]);
});

describe('a swap finished on a machine', () => {
  it('saves the chosen machine on the movement and its sets, with its loads', () => {
    const state = pushDayLogger();
    const swapped = swapExercise(
      state,
      state.movements[0].key,
      press,
      context({ workouts: [lastPush, pressOnHammer, pressOnCybex] }),
      { press: 'hammer' },
    );
    expect(swapped.movements[0].sets.map((item) => item.weight_kg)).toEqual([40, 40]);
    const done: LoggerState = {
      ...swapped,
      movements: swapped.movements.map((movement) => ({
        ...movement,
        sets: movement.sets.map((item) => ({ ...item, completed: true })),
      })),
    };
    const check = checkFinish(done, types, false, startedAt + 3_600_000);
    if (check.kind !== 'ready') throw new Error(`Not ready: ${check.kind}`);
    const input = finishInput(done, types, check);
    expect(input.movements[0]).toMatchObject({
      exercise_id: 'press',
      machine_photo_ids: ['hammer'],
    });
    expect(input.movements[0].sets.map((item) => [item.weight_kg, item.machine_photo_id])).toEqual([
      [40, 'hammer'],
      [40, 'hammer'],
    ]);
  });

  it('leaves out the workout being edited when finding the last session on the machine', () => {
    const edited = {
      ...pressOnHammer,
      id: 'being-edited',
      workout_date: '2026-11-21',
      movements: pressOnHammer.movements.map((movement) => ({
        ...movement,
        sets: movement.sets.map((item) => ({ ...item, weight_kg: 70 })),
      })),
    };
    const state = pushDayLogger();
    const workouts = context({ workouts: [edited, pressOnHammer] });
    const key = state.movements[0].key;
    const loads = (next: LoggerState) => next.movements[0].sets.map((item) => item.weight_kg);
    expect(loads(swapExercise(state, key, press, workouts, { press: 'hammer' }))).toEqual([70, 70]);
    expect(
      loads(swapExercise(state, key, press, workouts, { press: 'hammer' }, 'being-edited')),
    ).toEqual([40, 40]);
  });
});

describe("the chosen machine's setup, once loaded", () => {
  function logger(workouts: (typeof lastPush)[]) {
    let state = pushDayLogger();
    const change = (update: (current: LoggerState) => LoggerState) => {
      state = update(state);
    };
    return { change, get: () => state, context: context({ workouts }) };
  }
  const hammerRoutes = () => ({
    '/api/machine-photos/hammer/workouts': [pressOnHammer],
    '/api/exercises/press/machine-settings?machine_photo_id=hammer': { settings: hammerSettings },
  });

  it("reads the machine's last session when the loaded history has none on it", async () => {
    routes = hammerRoutes();
    // Only Cybex is in the loaded history: its 85 kg isn't Hammer's, so the loads wait, empty.
    const live = logger([lastPush, pressOnCybex]);
    const key = live.get().movements[0].key;
    const settled = swapOntoMachine(live.change, key, press, live.context, { press: 'hammer' });
    expect(live.get().movements[0].sets.map((item) => item.weight_kg)).toEqual([null, null]);
    const keys = live.get().movements[0].sets.map((item) => item.key);
    await act(async () => settled);
    // Each carried row keeps its key, so a note opened meanwhile still reaches it.
    expect(live.get().movements[0].sets.map((item) => item.key)).toEqual(keys);
    expect(live.get().movements[0]).toMatchObject({
      machinePhotoIds: ['hammer'],
      machineSettings: hammerSettings,
    });
    expect(live.get().movements[0].sets.map((item) => item.weight_kg)).toEqual([40, 40]);
  });

  it('keeps sets edited and settings recorded before it arrives', async () => {
    routes = hammerRoutes();
    const live = logger([lastPush, pressOnCybex]);
    const key = live.get().movements[0].key;
    const settled = swapOntoMachine(live.change, key, press, live.context, { press: 'hammer' });
    const mine = [{ name: 'Seat', value: '6' }];
    live.change((current) => ({
      ...current,
      movements: current.movements.map((movement, index) =>
        index === 0
          ? {
              ...movement,
              machineSettings: mine,
              sets: movement.sets.map((item) => ({ ...item, weight_kg: 90 })),
            }
          : movement,
      ),
    }));
    await act(async () => settled);
    expect(live.get().movements[0].machineSettings).toEqual(mine);
    expect(live.get().movements[0].sets.map((item) => item.weight_kg)).toEqual([90, 90]);
  });

  it('applies nothing once another account has signed in', async () => {
    routes = hammerRoutes();
    const live = logger([lastPush, pressOnCybex]);
    const key = live.get().movements[0].key;
    const settled = swapOntoMachine(live.change, key, press, live.context, { press: 'hammer' });
    const swapped = live.get();
    mockAccount = 'u2';
    await act(async () => settled);
    expect(live.get()).toBe(swapped);
  });
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function openSwap(onAdd = jest.fn()) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
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
        onClose={jest.fn()}
      />
    </QueryClientProvider>,
  );
  return onAdd;
}

describe('the swap picker before the saved machines are known', () => {
  async function openCold() {
    const catalog = deferred<MachinePhotoUsage[]>();
    jest
      .mocked(apiGet)
      .mockImplementation(async (path: string) =>
        path === '/api/machine-photos' ? (catalog.promise as never) : ([] as never),
      );
    const onAdd = await openSwap();
    return { catalog, onAdd };
  }

  it('keeps a picked exercise open until they load, then offers its machines', async () => {
    const { catalog, onAdd } = await openCold();
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })),
    );
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText('Loading machines…')).toBeVisible();
    await act(async () => catalog.resolve([hammer]));
    expect(await screen.findByRole('checkbox', { name: 'Hammer Strength press' })).toBeChecked();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Swap exercise' })));
    expect(onAdd).toHaveBeenCalledWith([press], { press: 'hammer' }, { hammer: 2 });
  });

  it('offers Try again, or swapping without choosing a machine, when they fail to load', async () => {
    const { catalog, onAdd } = await openCold();
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })),
    );
    await act(async () => catalog.reject(new Error('Relay is unavailable')));
    expect(await screen.findByText('Relay is unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Swap without choosing a machine' })),
    );
    expect(onAdd).toHaveBeenCalledWith([press], {}, {});
  });
});

describe('a machine photographed from the swap picker', () => {
  const added = { ...hammer, id: 'new-machine', caption: 'New press' };

  async function startPhoto() {
    const upload = deferred<typeof added>();
    jest
      .mocked(askForMachinePhoto)
      .mockImplementation((done) =>
        done({ uri: 'file://photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }, 'New press'),
      );
    jest.mocked(uploadMachinePhoto).mockImplementation(() => upload.promise);
    await openSwap();
    await screen.findByRole('button', { name: 'Show machines for Overhead Press' });
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })),
    );
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Add machine for Overhead Press' })),
    );
    expect(uploadMachinePhoto).toHaveBeenCalled();
    return upload;
  }

  it("never reaches another account's saved machines", async () => {
    const upload = await startPhoto();
    // Another account signs in while the upload is out: the cache is cleared and refilled.
    mockAccount = 'u2';
    const theirs = { ...hammer, id: 'theirs', caption: 'Their machine' };
    await act(async () => {
      client.clear();
      client.setQueryData(['machine-photos'], [theirs]);
    });
    await act(async () => upload.resolve(added));
    expect(client.getQueryData(['machine-photos'])).toEqual([theirs]);
  });

  it('is saved, but keeps a pick made while it uploaded', async () => {
    const upload = await startPhoto();
    // Overhead Press is unpicked before the photo is saved.
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })),
    );
    await act(async () => upload.resolve(added));
    expect(
      client.getQueryData<MachinePhotoUsage[]>(['machine-photos'])?.map((item) => item.id),
    ).toEqual(['hammer', 'new-machine']);
    expect(screen.getByRole('checkbox', { name: 'Overhead Press' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Swap exercise' })).toBeNull();
  });
});

test('a saved workout refreshes the machines, so the next swap starts on the newly used one', async () => {
  routes = { '/api/machine-photos': [hammer, { ...cybex, last_used_date: '2026-11-01' }] };
  await openSwap();
  await screen.findByRole('button', { name: 'Show machines for Overhead Press' });
  // A workout on Cybex is saved today.
  routes = { '/api/machine-photos': [{ ...cybex, last_used_date: '2026-11-22' }, hammer] };
  const { refreshTraining } =
    jest.requireActual<typeof import('../../data/queries')>('../../data/queries');
  await act(async () => refreshTraining(client));
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Cybex press' })).toBeChecked());
  expect(screen.getByRole('checkbox', { name: 'Hammer Strength press' })).not.toBeChecked();
});

describe('after the recheck', () => {
  function logger(workouts: (typeof lastPush)[]) {
    let state = pushDayLogger();
    const change = (update: (current: LoggerState) => LoggerState) => {
      state = update(state);
    };
    return {
      change,
      get: () => state,
      set: (next: LoggerState) => (state = next),
      context: context({ workouts }),
    };
  }
  /** Answers each path's requests in turn as the test releases them. */
  function heldRoutes() {
    const held = new Map<string, ReturnType<typeof deferred<unknown>>[]>();
    jest.mocked(apiGet).mockImplementation((path: string) => {
      const next = deferred<unknown>();
      held.set(path, [...(held.get(path) ?? []), next]);
      return next.promise as never;
    });
    return (path: string, index = 0) => {
      const request = held.get(path)?.[index];
      if (!request) throw new Error(`No request ${index} for ${path}`);
      return request;
    };
  }
  const settingsPath = '/api/exercises/press/machine-settings?machine_photo_id=hammer';
  const historyPath = '/api/machine-photos/hammer/workouts';

  it("leaves the loads empty when the machine's session can't be read", async () => {
    const request = heldRoutes();
    const live = logger([lastPush, pressOnCybex]);
    const settled = swapOntoMachine(live.change, live.get().movements[0].key, press, live.context, {
      press: 'hammer',
    });
    request(settingsPath).resolve({ settings: [] });
    request(historyPath).reject(new Error('Relay is unavailable'));
    await act(async () => settled);
    expect(live.get().movements[0].sets.map((item) => item.weight_kg)).toEqual([null, null]);
  });

  it('ignores a session chosen for an earlier date when the workout was redated meanwhile', async () => {
    const request = heldRoutes();
    const live = logger([lastPush, pressOnCybex]);
    const settled = swapOntoMachine(live.change, live.get().movements[0].key, press, live.context, {
      press: 'hammer',
    });
    live.change((current) => ({ ...current, workoutDate: '2026-11-01' }));
    request(settingsPath).resolve({ settings: [] });
    request(historyPath).resolve([pressOnHammer]);
    await act(async () => settled);
    expect(live.get().movements[0].sets.map((item) => item.weight_kg)).toEqual([null, null]);
  });

  it('a note added after the session arrives reaches its row', async () => {
    routes = { [historyPath]: [pressOnHammer], [settingsPath]: { settings: [] } };
    const live = logger([lastPush, pressOnCybex]);
    const movementKey = live.get().movements[0].key;
    const settled = swapOntoMachine(live.change, movementKey, press, live.context, {
      press: 'hammer',
    });
    // The note prompt opened on the first planned set before the answer.
    const setKey = live.get().movements[0].sets[0].key;
    await act(async () => settled);
    const noted = updateSet(
      live.get(),
      movementKey,
      setKey,
      { notes: 'Seat one notch lower' },
      {
        addedByHand: false,
        workoutBodyweight: null,
      },
    ).state;
    expect(noted.movements[0].sets[0]).toMatchObject({
      notes: 'Seat one notch lower',
      weight_kg: 40,
    });
  });

  it("an earlier swap's settings never fill a later swap back onto the same machine", async () => {
    const request = heldRoutes();
    const live = logger([lastPush, pressOnHammer]);
    const key = live.get().movements[0].key;
    const first = swapOntoMachine(live.change, key, press, live.context, { press: 'hammer' });
    // Away to Bench and back onto Hammer: the unlogged row keeps its key.
    void swapOntoMachine(live.change, key, bench, live.context);
    const second = swapOntoMachine(live.change, key, press, live.context, { press: 'hammer' });
    request(settingsPath, 1).resolve({ settings: [{ name: 'Seat', value: '7' }] });
    await act(async () => second);
    request(settingsPath, 0).resolve({ settings: [{ name: 'Seat', value: '4' }] });
    await act(async () => first);
    expect(live.get().movements[0].machineSettings).toEqual([{ name: 'Seat', value: '7' }]);
  });
});

describe('the swap picker while its machines are read again', () => {
  it('chooses nothing automatically until the refresh lands', async () => {
    const refresh = deferred<MachinePhotoUsage[]>();
    let reads = 0;
    jest.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path !== '/api/machine-photos') return [] as never;
      reads += 1;
      // Hammer was used last; then a workout on Cybex is saved and the list is read again.
      return (
        reads === 1 ? [hammer, { ...cybex, last_used_date: '2026-11-01' }] : refresh.promise
      ) as never;
    });
    const onAdd = await openSwap();
    await screen.findByRole('button', { name: 'Show machines for Overhead Press' });
    const { refreshTraining } =
      jest.requireActual<typeof import('../../data/queries')>('../../data/queries');
    await act(async () => {
      void refreshTraining(client);
    });
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })),
    );
    // The old list's Hammer isn't chosen for you while the new one is on its way.
    expect(screen.getByRole('checkbox', { name: 'Hammer Strength press' })).not.toBeChecked();
    expect(screen.getByText('Loading machines…')).toBeVisible();
    await act(async () => refresh.resolve([{ ...cybex, last_used_date: '2026-11-22' }, hammer]));
    expect(
      await screen.findByRole('checkbox', { name: 'Cybex press', checked: true }),
    ).toBeVisible();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Swap exercise' })));
    expect(onAdd).toHaveBeenCalledWith([press], { press: 'cybex' }, { cybex: 5 });
  });
});

describe("a machine photo's session", () => {
  async function pickAndPhotograph(machines: MachinePhotoUsage[]) {
    routes = { '/api/machine-photos': machines };
    const upload = deferred<typeof hammer>();
    jest
      .mocked(askForMachinePhoto)
      .mockImplementation((done) =>
        done({ uri: 'file://photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }, 'New press'),
      );
    jest.mocked(uploadMachinePhoto).mockImplementation(() => upload.promise);
    const onAdd = await openSwap();
    await screen.findByRole('button', { name: 'Show machines for Overhead Press' });
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })),
    );
    return { upload, onAdd };
  }

  it("is sent with the session's own token", async () => {
    await pickAndPhotograph([hammer]);
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Add machine for Overhead Press' })),
    );
    expect(uploadMachinePhoto).toHaveBeenCalledWith(
      'press',
      expect.anything(),
      'New press',
      [],
      'token',
    );
  });

  it('is never sent when another account signs in while its token is read', async () => {
    const token = deferred<string>();
    jest.mocked(sessionToken).mockImplementationOnce(() => token.promise);
    await pickAndPhotograph([hammer]);
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Add machine for Overhead Press' })),
    );
    mockAccount = 'u2';
    await act(async () => token.resolve('token'));
    expect(uploadMachinePhoto).not.toHaveBeenCalled();
  });

  it('forgets only the token it was refused with', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    try {
      const { upload } = await pickAndPhotograph([hammer]);
      await act(async () =>
        fireEvent.press(screen.getByRole('button', { name: 'Add machine for Overhead Press' })),
      );
      await act(async () => upload.reject(new ApiError(401, 'Sign in to continue.')));
      expect(forgetSessionTokenIf).toHaveBeenCalledWith('https://relay.test', 'token');
    } finally {
      alert.mockRestore();
    }
  });

  it('keeps a machine chosen while it uploaded', async () => {
    // Cybex is the default; Hammer is chosen by hand while the new photo uploads.
    const { upload, onAdd } = await pickAndPhotograph([cybex, hammer]);
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Add machine for Overhead Press' })),
    );
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Hammer Strength press' })),
    );
    await act(async () => upload.resolve({ ...hammer, id: 'new-machine', caption: 'New press' }));
    expect(await screen.findByRole('checkbox', { name: 'New press' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hammer Strength press' })).toBeChecked();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Swap exercise' })));
    expect(onAdd).toHaveBeenCalledWith([press], { press: 'hammer' }, { hammer: 2 });
  });
});

describe('a machine no saved workout has used', () => {
  it('keeps the general suggestion at once, so a quick tick logs a weight', async () => {
    const requested: string[] = [];
    jest.mocked(apiGet).mockImplementation(async (path: string) => {
      requested.push(path);
      return (path.includes('machine-settings') ? { settings: [] } : []) as never;
    });
    let state = pushDayLogger();
    const change = (update: (current: LoggerState) => LoggerState) => {
      state = update(state);
    };
    const movementKey = state.movements[0].key;
    const settled = swapOntoMachine(
      change,
      movementKey,
      press,
      context({ workouts: [lastPush, pressOnCybex] }),
      { press: 'hammer' },
      undefined,
      { hammer: 0 },
    );
    // The usual suggestion, straight away; there is no session of its own to wait for.
    expect(state.movements[0].sets.map((item) => item.weight_kg)).toEqual([85, 85]);
    const ticked = updateSet(
      state,
      movementKey,
      state.movements[0].sets[0].key,
      { completed: true },
      { addedByHand: false, workoutBodyweight: null },
    ).state;
    expect(ticked.movements[0].sets[0]).toMatchObject({ completed: true, weight_kg: 85 });
    await act(async () => settled);
    // Only its settings are read.
    expect(requested).toEqual(['/api/exercises/press/machine-settings?machine_photo_id=hammer']);
  });

  it('is reported to the swap by the picker with its saved workout count', async () => {
    routes = { '/api/machine-photos': [{ ...hammer, workout_count: 0, last_used_date: null }] };
    const onAdd = await openSwap();
    await screen.findByRole('button', { name: 'Show machines for Overhead Press' });
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })),
    );
    await act(async () =>
      fireEvent.press(screen.getByRole('checkbox', { name: 'Hammer Strength press' })),
    );
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Swap exercise' })));
    expect(onAdd).toHaveBeenCalledWith([press], { press: 'hammer' }, { hammer: 0 });
  });
});

test('a machine list whose refresh failed chooses nothing, and offers swapping without one', async () => {
  let reads = 0;
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path !== '/api/machine-photos') return [] as never;
    reads += 1;
    if (reads > 1) throw new Error('Relay is unavailable');
    return [hammer, { ...cybex, last_used_date: '2026-11-01' }] as never;
  });
  const onAdd = await openSwap();
  await screen.findByRole('button', { name: 'Show machines for Overhead Press' });
  const { refreshTraining } =
    jest.requireActual<typeof import('../../data/queries')>('../../data/queries');
  await act(async () => {
    await refreshTraining(client).catch(() => undefined);
  });
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' })));
  expect(await screen.findByText('Relay is unavailable')).toBeVisible();
  // The old list's Hammer isn't chosen for you.
  expect(screen.getByRole('checkbox', { name: 'Hammer Strength press' })).not.toBeChecked();
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Swap without choosing a machine' })),
  );
  expect(onAdd).toHaveBeenCalledWith([press], {}, {});
});
